package ru.godeck.presentation.service;

import static ru.godeck.presentation.model.PresentationStatus.*;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ru.godeck.presentation.dto.ConfirmPresentationOutlineRequest;
import ru.godeck.presentation.dto.PresentationOutlineView;
import ru.godeck.presentation.dto.PresentationView;
import ru.godeck.presentation.dto.SavePresentationOutlineRequest;
import ru.godeck.presentation.entity.Presentation;
import ru.godeck.presentation.exception.GenerationError;
import ru.godeck.presentation.exception.GenerationException;
import ru.godeck.presentation.mapper.PresentationContentCodec;
import ru.godeck.presentation.model.PresentationContent;
import ru.godeck.presentation.repository.PresentationRepository;
import ru.godeck.presentation.template.PresentationTemplateService;

import java.time.Clock;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Reviews the one persisted AI result before file rendering. Short row-locked updates permit only
 * reordering, inclusion, and unambiguous primary-title edits; they never call AI or perform file
 * I/O.
 */
@Service
public class PresentationOutlineService {
    private static final Set<String> LOCAL_TITLES = Set.of("LEFT_TITLE", "RIGHT_TITLE");
    private final PresentationRepository presentations;
    private final PresentationTemplateService templates;
    private final PresentationContentCodec codec;
    private final Clock clock;

    public PresentationOutlineService(
            PresentationRepository presentations,
            PresentationTemplateService templates,
            PresentationContentCodec codec,
            Clock clock) {
        this.presentations = presentations;
        this.templates = templates;
        this.codec = codec;
        this.clock = clock;
    }

    /**
     * Rehydrates review after navigation/restart from DB; no uploaded source or provider request is
     * exposed.
     */
    @Transactional(readOnly = true)
    public PresentationOutlineView get(UUID owner, UUID id) {
        var p =
                presentations
                        .findByIdAndUserId(id, owner)
                        .orElseThrow(PresentationOutlineService::missing);
        requireOpen(p);
        return view(p, codec.decode(p.getContentJson()));
    }

    /**
     * Saves an exact complete source-slide permutation against its revision, preserving all other
     * slide fields.
     */
    @Transactional
    public PresentationOutlineView save(
            UUID owner, UUID id, SavePresentationOutlineRequest request) {
        var p = locked(owner, id);
        requireOpen(p);
        if (request == null || request.revision() < 1) throw invalid();
        requireRevision(p, request.revision());
        var current = codec.decode(p.getContentJson());
        var projection = view(p, current);
        if (request.slides() == null || request.slides().size() != current.slides().size())
            throw invalid();
        var savedSlides =
                current.slides().stream()
                        .collect(
                                Collectors.toMap(PresentationContent.Slide::slide, slide -> slide));
        var projected =
                projection.slides().stream()
                        .collect(
                                Collectors.toMap(
                                        PresentationOutlineView.Slide::sourceSlideNumber,
                                        slide -> slide));
        var fields = new LinkedHashMap<>(current.fields());
        var slides = new ArrayList<PresentationContent.Slide>();
        var seen = new HashSet<Integer>();
        for (var decision : request.slides()) {
            if (decision == null
                    || decision.include() == null
                    || !seen.add(decision.sourceSlideNumber())) throw invalid();
            var original = savedSlides.get(decision.sourceSlideNumber());
            var row = projected.get(decision.sourceSlideNumber());
            if (original == null || row == null) throw invalid();
            if (row.titleFieldKey() == null) {
                if (decision.title() != null) throw invalid();
            } else {
                String title = decision.title();
                if (title == null
                        || title.isBlank()
                        || title.length() > row.titleMaxChars()
                        || title.contains("{{")
                        || title.contains("}}")
                        || title.codePoints()
                                .anyMatch(
                                        value ->
                                                Character.isISOControl(value)
                                                        && value != '\n'
                                                        && value != '\t')) throw invalid();
                fields.put(row.titleFieldKey(), title);
            }
            slides.add(
                    new PresentationContent.Slide(
                            original.slide(),
                            decision.include(),
                            original.reason(),
                            original.hidden(),
                            original.textBlocks(),
                            original.imageBlocks(),
                            original.textLayouts()));
        }
        if (slides.stream().noneMatch(slide -> Boolean.TRUE.equals(slide.include())))
            throw invalid();
        var updated =
                templates.normalize(
                        p.getTemplateId(), new PresentationContent(fields, List.copyOf(slides)));
        if (!updated.equals(current)) p.saveOutline(codec.encode(updated), clock.instant());
        return view(p, updated);
    }

    /**
     * Confirms once, or returns the same job on retry; no new generation/version is started by a
     * replay.
     */
    @Transactional
    public PresentationView confirm(
            UUID owner, UUID id, ConfirmPresentationOutlineRequest request) {
        var p = locked(owner, id);
        if (request == null || request.revision() < 1) throw invalid();
        if (!p.isReviewBeforeRender() || p.getStatus() == CANCELLED || p.getStatus() == FAILED)
            throw closed();
        requireRevision(p, request.revision());
        if (p.getOutlineConfirmedRevision() != null) {
            if (p.getOutlineConfirmedRevision() == request.revision()
                    && (p.getStatus() == QUEUED
                            || p.getStatus() == RUNNING
                            || p.getStatus() == SUCCEEDED)) return PresentationView.from(p);
            throw closed();
        }
        requireOpen(p);
        templates.normalize(p.getTemplateId(), codec.decode(p.getContentJson()));
        p.confirmOutline(clock.instant());
        return PresentationView.from(p);
    }

    private Presentation locked(UUID owner, UUID id) {
        return presentations
                .findOutlineForUpdate(id, owner)
                .orElseThrow(PresentationOutlineService::missing);
    }

    private static void requireRevision(Presentation p, long revision) {
        if (p.getOutlineRevision() != revision)
            throw new GenerationException(GenerationError.OUTLINE_CONFLICT);
    }

    private static void requireOpen(Presentation p) {
        if (!p.isReviewBeforeRender()
                || p.getStatus() != AWAITING_REVIEW
                || p.getOutlineConfirmedRevision() != null
                || p.getContentJson() == null) throw closed();
    }

    /**
     * The projection derives safe primary fields from the existing manifest; shared/ambiguous/empty
     * fields stay read-only.
     */
    private PresentationOutlineView view(Presentation p, PresentationContent content) {
        var manifest = templates.slideManifest(p.getTemplateId());
        var usage = new HashMap<String, Integer>();
        var fieldsBySlide = new HashMap<Integer, List<String>>();
        for (var entry : manifest) {
            List<String> fields =
                    ((List<?>) entry.get("fields")).stream().map(String.class::cast).toList();
            fieldsBySlide.put(((Number) entry.get("slide")).intValue(), fields);
            fields.forEach(field -> usage.merge(field, 1, Integer::sum));
        }
        var descriptions = templates.description(p.getTemplateId()).path("slide_rules");
        var limits = templates.fields(p.getTemplateId());
        var rows =
                content.slides().stream()
                        .map(
                                slide -> {
                                    List<String> fields =
                                            fieldsBySlide.getOrDefault(slide.slide(), List.of());
                                    List<String> candidates =
                                            fields.stream()
                                                    .filter(
                                                            PresentationOutlineService
                                                                    ::primaryTitle)
                                                    .toList();
                                    String key =
                                            candidates.size() == 1
                                                            && usage.getOrDefault(
                                                                            candidates.getFirst(),
                                                                            0)
                                                                    == 1
                                                    ? candidates.getFirst()
                                                    : null;
                                    if (key != null && content.fields().get(key).isBlank())
                                        key = null;
                                    String summary =
                                            cap(
                                                    fields.stream()
                                                            .filter(
                                                                    field ->
                                                                            !field.equals("FOOTER")
                                                                                    && !field
                                                                                            .equals(
                                                                                                    "TITLE"))
                                                            .map(content.fields()::get)
                                                            .filter(
                                                                    value ->
                                                                            value != null
                                                                                    && !value
                                                                                            .isBlank())
                                                            .collect(Collectors.joining(" · ")),
                                                    360);
                                    String description =
                                            cap(
                                                    descriptions
                                                            .path(Integer.toString(slide.slide()))
                                                            .path("purpose")
                                                            .asText(
                                                                    "Слайд из выбранного шаблона."
                                                                        + " Порядок и включение"
                                                                        + " можно изменить."),
                                                    500);
                                    return new PresentationOutlineView.Slide(
                                            slide.slide(),
                                            Boolean.TRUE.equals(slide.include()),
                                            key == null
                                                    ? "Слайд " + slide.slide()
                                                    : content.fields().get(key),
                                            key,
                                            key == null ? null : limits.get(key),
                                            description,
                                            summary);
                                })
                        .toList();
        return new PresentationOutlineView(
                p.getId(), p.getTemplateId(), p.getStatus(), p.getOutlineRevision(), rows);
    }

    private static boolean primaryTitle(String field) {
        return field.equals("TITLE")
                || field.equals("STATEMENT")
                || field.endsWith("_TITLE")
                        && !LOCAL_TITLES.contains(field)
                        && !field.matches(".*\\d.*");
    }

    private static String cap(String value, int max) {
        if (value.length() <= max) return value;
        int end = Character.isHighSurrogate(value.charAt(max - 1)) ? max - 1 : max;
        return value.substring(0, end) + "…";
    }

    private static GenerationException missing() {
        return new GenerationException(GenerationError.PRESENTATION_NOT_FOUND);
    }

    private static GenerationException invalid() {
        return new GenerationException(GenerationError.INVALID_OUTLINE);
    }

    private static GenerationException closed() {
        return new GenerationException(GenerationError.OUTLINE_CLOSED);
    }
}
