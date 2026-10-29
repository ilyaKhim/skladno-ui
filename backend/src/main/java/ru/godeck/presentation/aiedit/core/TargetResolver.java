package ru.godeck.presentation.aiedit.core;

import static ru.godeck.presentation.model.PresentationStatus.SUCCEEDED;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ru.godeck.presentation.aiedit.policy.AiEditPolicy;
import ru.godeck.presentation.entity.Presentation;
import ru.godeck.presentation.exception.GenerationError;
import ru.godeck.presentation.exception.GenerationException;
import ru.godeck.presentation.mapper.PresentationContentCodec;
import ru.godeck.presentation.mapper.PresentationEditorDraftCodec;
import ru.godeck.presentation.model.PresentationContent;
import ru.godeck.presentation.repository.PresentationRepository;
import ru.godeck.presentation.template.EditorTextLimits;
import ru.godeck.presentation.template.PresentationTemplateService;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Verifies an AI edit target against the saved presentation and derives its limits and context.
 *
 * <p>The document is the current editor draft when it is based on the published version, otherwise
 * the published {@code content_json}: the same rule the editor uses to load. The browser saves its
 * draft before asking, so a block that exists only in unsaved browser state is rejected.
 *
 * <p>Only the minimal context leaves this class: the field role and two short titles. Other fields,
 * slides, the topic and the template description are never part of the result.
 */
@Service
public class TargetResolver {
    private static final String TITLE_FIELD = "TITLE";
    private static final String TITLE_MARKER = "TITLE";
    private static final String TEMPLATE_MARKER_OPEN = "{{";
    private static final String TEMPLATE_MARKER_CLOSE = "}}";

    private final PresentationRepository presentations;
    private final PresentationTemplateService templates;
    private final PresentationContentCodec contentCodec;
    private final PresentationEditorDraftCodec editorCodec;

    public TargetResolver(
            PresentationRepository presentations,
            PresentationTemplateService templates,
            PresentationContentCodec contentCodec,
            PresentationEditorDraftCodec editorCodec) {
        this.presentations = presentations;
        this.templates = templates;
        this.contentCodec = contentCodec;
        this.editorCodec = editorCodec;
    }

    /**
     * Resolves the target of one edit.
     *
     * @param userId owner resolved from the authenticated session
     * @param presentationId presentation being edited
     * @param target structurally valid target from the request
     * @param text source text of the edit
     * @return target with limits and context
     * @throws GenerationException {@code presentation_not_found}, {@code presentation_not_ready},
     *     {@code invalid_target}, {@code invalid_text} or {@code text_too_long}
     */
    @Transactional(readOnly = true)
    public ResolvedTextTarget resolve(
            UUID userId, UUID presentationId, AiEditTarget target, String text) {
        Presentation presentation =
                presentations
                        .findByIdAndUserId(presentationId, userId)
                        .orElseThrow(
                                () -> new GenerationException(GenerationError.PRESENTATION_NOT_FOUND));
        if (presentation.getStatus() != SUCCEEDED)
            throw new GenerationException(GenerationError.PRESENTATION_NOT_READY);
        return resolve(presentation.getTemplateId(), presentationId, document(presentation), target, text);
    }

    /** Pure resolution against an already loaded document; separated for unit tests. */
    public ResolvedTextTarget resolve(
            String templateId,
            UUID presentationId,
            PresentationContent content,
            AiEditTarget target,
            String text) {
        PresentationContent.Slide slide =
                content.slides().stream()
                        .filter(candidate -> candidate.slide() == target.slideNumber())
                        .filter(candidate -> Boolean.TRUE.equals(candidate.include()))
                        .findFirst()
                        .orElseThrow(TargetResolver::invalidTarget);
        List<String> slideFields = manifest(templateId).getOrDefault(slide.slide(), List.of());
        ResolvedTextTarget resolved =
                switch (target) {
                    case AiEditTarget.TemplateFieldTarget field -> {
                        Integer max = templates.fields(templateId).get(field.fieldKey());
                        if (max == null || !slideFields.contains(field.fieldKey()))
                            throw invalidTarget();
                        int hard = EditorTextLimits.hard(max);
                        yield new ResolvedTextTarget(
                                presentationId,
                                templateId,
                                target,
                                max,
                                hard,
                                hard,
                                role(templateId, field.fieldKey()),
                                deckTitle(content),
                                slideTitle(content, slideFields, field.fieldKey()));
                    }
                    case AiEditTarget.CustomBlockTarget block -> {
                        if (slide.textBlocksOrEmpty().stream()
                                .noneMatch(candidate -> candidate.id().equals(block.blockId())))
                            throw invalidTarget();
                        yield new ResolvedTextTarget(
                                presentationId,
                                templateId,
                                target,
                                AiEditPolicy.CUSTOM_BLOCK_MAX_CHARS,
                                AiEditPolicy.CUSTOM_BLOCK_MAX_CHARS,
                                AiEditPolicy.CUSTOM_BLOCK_MAX_INPUT_CHARS,
                                null,
                                deckTitle(content),
                                slideTitle(content, slideFields, null));
                    }
                };
        checkText(text, resolved);
        return resolved;
    }

    private static void checkText(String text, ResolvedTextTarget target) {
        if (text == null
                || text.isBlank()
                || text.contains(TEMPLATE_MARKER_OPEN)
                || text.contains(TEMPLATE_MARKER_CLOSE))
            throw new GenerationException(GenerationError.INVALID_TEXT);
        if (text.length() > target.maxInputChars())
            throw new GenerationException(GenerationError.TEXT_TOO_LONG);
    }

    /** Same document selection as the editor: a current draft wins over published content. */
    private PresentationContent document(Presentation presentation) {
        if (presentation.getEditorJson() != null
                && presentation.getEditorBaseVersion() != null
                && presentation.getEditorBaseVersion() == presentation.getCurrentVersion())
            return editorCodec.decode(presentation.getEditorJson()).content();
        if (presentation.getContentJson() == null)
            throw new GenerationException(GenerationError.CONTENT_UNAVAILABLE);
        return contentCodec.decode(presentation.getContentJson());
    }

    /** Field description from the template sidecar; templates without a sidecar have none. */
    private String role(String templateId, String field) {
        var description =
                templates.description(templateId).path("field_hints").path(field).path("description");
        return description.isString() ? context(description.asText(), AiEditPolicy.ROLE_MAX) : null;
    }

    private static String deckTitle(PresentationContent content) {
        return context(content.fields().get(TITLE_FIELD), AiEditPolicy.CONTEXT_TITLE_MAX);
    }

    /**
     * First title-like field of the slide manifest (else the first field), or {@code null} when it
     * is the target itself.
     */
    private static String slideTitle(
            PresentationContent content, List<String> slideFields, String targetField) {
        String field =
                slideFields.stream()
                        .filter(name -> name.contains(TITLE_MARKER))
                        .findFirst()
                        .orElse(slideFields.isEmpty() ? null : slideFields.getFirst());
        if (field == null || field.equals(targetField)) return null;
        return context(content.fields().get(field), AiEditPolicy.CONTEXT_TITLE_MAX);
    }

    /** Shortens model context without splitting a surrogate pair; blank values become null. */
    static String context(String value, int max) {
        if (value == null) return null;
        String text = value.strip();
        if (text.length() > max) {
            int end = max;
            if (Character.isHighSurrogate(text.charAt(end - 1))
                    && Character.isLowSurrogate(text.charAt(end))) end--;
            text = text.substring(0, end).strip();
        }
        return text.isEmpty() ? null : text;
    }

    @SuppressWarnings("unchecked")
    private Map<Integer, List<String>> manifest(String templateId) {
        Map<Integer, List<String>> result = new java.util.LinkedHashMap<>();
        for (var slide : templates.slideManifest(templateId))
            result.put((Integer) slide.get("slide"), (List<String>) slide.get("fields"));
        return result;
    }

    private static GenerationException invalidTarget() {
        return new GenerationException(GenerationError.INVALID_TARGET);
    }
}
