package ru.godeck.presentation.aiedit.service;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ru.godeck.presentation.ai.AiOperation;
import ru.godeck.presentation.ai.PresentationAiCallRepository;
import ru.godeck.presentation.aiedit.action.TextEditAction;
import ru.godeck.presentation.aiedit.config.AiEditSettings;
import ru.godeck.presentation.aiedit.core.AiEditFailureReason;
import ru.godeck.presentation.aiedit.core.AiEditOutcome;
import ru.godeck.presentation.aiedit.core.AiEditStatus;
import ru.godeck.presentation.aiedit.core.TargetKind;
import ru.godeck.presentation.aiedit.dto.AiEditHistoryItemView;
import ru.godeck.presentation.aiedit.dto.AiEditHistoryView;
import ru.godeck.presentation.aiedit.dto.AiEditOutcomeRequest;
import ru.godeck.presentation.aiedit.dto.TextEditTargetDto;
import ru.godeck.presentation.aiedit.dto.TextEditView;
import ru.godeck.presentation.aiedit.dto.TextVariantView;
import ru.godeck.presentation.aiedit.entity.PresentationAiEdit;
import ru.godeck.presentation.aiedit.policy.AiEditPolicy;
import ru.godeck.presentation.aiedit.repository.PresentationAiEditRepository;
import ru.godeck.presentation.exception.GenerationError;
import ru.godeck.presentation.exception.GenerationException;
import ru.godeck.presentation.repository.PresentationRepository;

import tools.jackson.databind.ObjectMapper;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * The AI feed of a presentation: reading the journal, recording what the user did with a proposal
 * and clearing the feed. Every operation first checks the owner of the presentation and runs in one
 * short transaction; no model is called and quota is not spent.
 *
 * <p>Clearing keeps journal rows without their texts: quota and idempotency rest on them, and
 * retention removes them on the usual schedule.
 */
@Service
public class AiEditHistoryService {
    private static final String CURSOR_SEPARATOR = "|";
    private static final String CLEARED_PARAMS = "{}";
    private static final String TARGET_SEPARATOR = "/";

    private final PresentationAiEditRepository edits;
    private final PresentationAiCallRepository calls;
    private final PresentationRepository presentations;
    private final ObjectMapper json;
    private final Clock clock;
    private final AiEditSettings settings;

    public AiEditHistoryService(
            PresentationAiEditRepository edits,
            PresentationAiCallRepository calls,
            PresentationRepository presentations,
            ObjectMapper json,
            Clock clock,
            AiEditSettings settings) {
        this.edits = edits;
        this.calls = calls;
        this.presentations = presentations;
        this.json = json;
        this.clock = clock;
        this.settings = settings;
    }

    /**
     * Reads one page of the feed, newest first.
     *
     * @param limit page size, 1…{@link AiEditPolicy#HISTORY_MAX_LIMIT}
     * @param before {@code next_before} of the previous page, or {@code null}
     * @throws GenerationException {@code presentation_not_found} or {@code invalid_input}
     */
    @Transactional(readOnly = true)
    public AiEditHistoryView history(UUID userId, UUID presentationId, int limit, String before) {
        requireOwner(userId, presentationId);
        if (limit < 1 || limit > AiEditPolicy.HISTORY_MAX_LIMIT)
            throw new GenerationException(GenerationError.INVALID_INPUT);
        // One extra row tells whether another page exists.
        Pageable page = PageRequest.of(0, limit + 1);
        List<PresentationAiEdit> rows;
        if (before == null) {
            rows = edits.findHistory(presentationId, userId, AiEditStatus.RUNNING, page);
        } else {
            Cursor cursor = Cursor.parse(before);
            rows =
                    edits.findHistoryBefore(
                            presentationId,
                            userId,
                            AiEditStatus.RUNNING,
                            cursor.createdAt(),
                            cursor.id(),
                            page);
        }
        boolean more = rows.size() > limit;
        List<PresentationAiEdit> shown = more ? rows.subList(0, limit) : rows;
        return new AiEditHistoryView(
                shown.stream().map(this::item).toList(),
                more ? Cursor.of(shown.getLast()).encoded() : null);
    }

    /**
     * Stores what the user did with a proposal; the last value replaces the previous one.
     *
     * @throws GenerationException {@code presentation_not_found}, {@code ai_edit_not_found} or
     *     {@code invalid_input}
     */
    @Transactional
    public void recordOutcome(
            UUID userId, UUID presentationId, UUID editId, AiEditOutcomeRequest request) {
        requireOwner(userId, presentationId);
        PresentationAiEdit edit =
                edits.findByIdAndUserIdAndPresentationId(editId, userId, presentationId)
                        .filter(found -> found.getClearedAt() == null)
                        .filter(found -> found.getStatus() != AiEditStatus.RUNNING)
                        .orElseThrow(() -> new GenerationException(GenerationError.AI_EDIT_NOT_FOUND));
        AiEditOutcome outcome =
                AiEditOutcome.parse(request.outcome())
                        .orElseThrow(() -> new GenerationException(GenerationError.INVALID_INPUT));
        Integer variant = request.variant();
        boolean validVariant =
                outcome == AiEditOutcome.APPLIED
                        ? variant != null && variant >= 0 && variant < variantCount(edit)
                        : variant == null;
        if (!validVariant) throw new GenerationException(GenerationError.INVALID_INPUT);
        int updated =
                edits.recordOutcome(
                        editId,
                        userId,
                        presentationId,
                        outcome.value(),
                        variant == null ? null : variant.shortValue(),
                        clock.instant());
        if (updated == 0) throw new GenerationException(GenerationError.AI_EDIT_NOT_FOUND);
    }

    /**
     * Clears the feed. Texts leave the journal and the provider audit at once; numbers and quota
     * stay. A running edit younger than the stale deadline and its unfinished audit record are left
     * alone: the request completes as usual and appears in the feed. Older ones are abandoned, so
     * they fail first and lose their texts too. Repeating the call is safe.
     *
     * @throws GenerationException {@code presentation_not_found}
     */
    @Transactional
    public void clear(UUID userId, UUID presentationId) {
        requireOwner(userId, presentationId);
        Instant now = clock.instant();
        Instant staleBefore = now.minus(settings.staleAfter());
        edits.failStale(
                presentationId,
                userId,
                AiEditStatus.RUNNING,
                AiEditStatus.FAILED,
                GenerationError.AI_EDIT_FAILED.code(),
                AiEditFailureReason.INTERNAL.value(),
                staleBefore,
                now);
        edits.clearHistory(presentationId, userId, AiEditStatus.RUNNING, CLEARED_PARAMS, now);
        calls.deleteFinished(presentationId, AiOperation.TEXT_EDIT, staleBefore);
    }

    private void requireOwner(UUID userId, UUID presentationId) {
        presentations
                .findByIdAndUserId(presentationId, userId)
                .orElseThrow(() -> new GenerationException(GenerationError.PRESENTATION_NOT_FOUND));
    }

    /** New kinds of journal records add their own reader here. */
    private AiEditHistoryItemView item(PresentationAiEdit edit) {
        return switch (edit.getKind()) {
            case TEXT_EDIT -> textEdit(edit);
        };
    }

    private AiEditHistoryItemView textEdit(PresentationAiEdit edit) {
        TextEditView stored = stored(edit);
        return new AiEditHistoryItemView(
                edit.getId(),
                edit.getCreatedAt(),
                edit.getRefinesEditId(),
                edit.getAction(),
                instruction(edit),
                target(edit),
                edit.getStatus(),
                stored == null ? null : stored.reason(),
                stored == null ? null : stored.message(),
                stored == null ? List.of() : stored.suggestions(),
                stored == null ? null : stored.sourceText(),
                stored == null ? null : stored.maxChars(),
                stored == null ? null : stored.hardMaxChars(),
                stored == null ? List.<TextVariantView>of() : stored.variants(),
                edit.getOutcome(),
                edit.getOutcomeVariant(),
                edit.getPromptVersion() != null);
    }

    private TextEditView stored(PresentationAiEdit edit) {
        return edit.getResultJson() == null
                ? null
                : json.readValue(edit.getResultJson(), TextEditView.class);
    }

    private int variantCount(PresentationAiEdit edit) {
        TextEditView stored = stored(edit);
        return stored == null ? 0 : stored.variants().size();
    }

    @SuppressWarnings("unchecked")
    private String instruction(PresentationAiEdit edit) {
        if (!TextEditAction.CUSTOM.id().equals(edit.getAction())) return null;
        return ((Map<String, String>) json.readValue(edit.getParamsJson(), Map.class))
                .get(TextEditAction.INSTRUCTION);
    }

    /** Rebuilt from the journal columns: a failed edit has no stored response to read it from. */
    private static TextEditTargetDto target(PresentationAiEdit edit) {
        String reference = edit.getTargetRef();
        int separator = reference.indexOf(TARGET_SEPARATOR);
        String slide = reference.substring(0, separator);
        String key = reference.substring(separator + 1);
        TargetKind kind = edit.getTargetKind();
        return new TextEditTargetDto(
                kind.value(),
                slide,
                kind == TargetKind.TEMPLATE_FIELD ? key : null,
                kind == TargetKind.CUSTOM_BLOCK ? key : null);
    }

    /** Keyset position in the {@code (created_at DESC, id DESC)} order. */
    private record Cursor(Instant createdAt, UUID id) {
        static Cursor of(PresentationAiEdit edit) {
            return new Cursor(edit.getCreatedAt(), edit.getId());
        }

        String encoded() {
            byte[] pair = (createdAt + CURSOR_SEPARATOR + id).getBytes(StandardCharsets.UTF_8);
            return Base64.getUrlEncoder().withoutPadding().encodeToString(pair);
        }

        static Cursor parse(String value) {
            try {
                String pair = new String(Base64.getUrlDecoder().decode(value), StandardCharsets.UTF_8);
                int separator = pair.indexOf(CURSOR_SEPARATOR);
                return new Cursor(
                        Instant.parse(pair.substring(0, separator)),
                        UUID.fromString(pair.substring(separator + 1)));
            } catch (IllegalArgumentException | DateTimeParseException | IndexOutOfBoundsException invalid) {
                throw new GenerationException(GenerationError.INVALID_INPUT);
            }
        }
    }
}
