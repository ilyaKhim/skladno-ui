package ru.godeck.presentation.aiedit.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ru.godeck.common.text.BackendMessages;
import ru.godeck.presentation.aiedit.ai.ResponsesUsage;
import ru.godeck.presentation.aiedit.core.AiEditStatus;
import ru.godeck.presentation.aiedit.dto.AiQuotaView;
import ru.godeck.presentation.aiedit.dto.TextEditView;
import ru.godeck.presentation.aiedit.entity.PresentationAiEdit;
import ru.godeck.presentation.aiedit.policy.AiEditPolicy;
import ru.godeck.presentation.aiedit.repository.PresentationAiEditRepository;
import ru.godeck.presentation.exception.GenerationError;
import ru.godeck.presentation.exception.GenerationException;

import tools.jackson.databind.ObjectMapper;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import java.util.function.Function;

/**
 * Short transactions around the single model call of an AI edit.
 *
 * <p>No transaction is open while the model runs: {@link #start} commits the {@code running} row
 * before the call, {@link #complete} or {@link #fail} store the outcome after it. A stale row is
 * marked failed and that change is committed even though the method then reports an error.
 */
@Service
public class AiEditTransactions {
    private static final DateTimeFormatter RESET_TIME =
            DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm").withZone(ZoneId.of("Europe/Moscow"));
    private final PresentationAiEditRepository edits;
    private final ObjectMapper json;
    private final Clock clock;

    public AiEditTransactions(PresentationAiEditRepository edits, ObjectMapper json, Clock clock) {
        this.edits = edits;
        this.json = json;
        this.clock = clock;
    }

    /**
     * Resolves idempotency, checks the quota and inserts a {@code running} edit.
     *
     * <ul>
     *   <li>same request id with another hash: {@code idempotency_conflict};
     *   <li>still running and younger than {@link AiEditPolicy#STALE_AFTER}: {@code
     *       ai_edit_in_progress};
     *   <li>running but stale: marked failed, {@code ai_edit_failed};
     *   <li>completed: the stored response with {@code replayed: true}, no quota spent;
     *   <li>failed: {@code ai_edit_failed} again.
     * </ul>
     *
     * Otherwise {@link AiEditPolicy#MAX_TEXT_EDITS_PER_DAY} rows in the window give {@code
     * ai_edit_limit}. Two concurrent first requests race on {@code UNIQUE (user_id, request_id)};
     * the loser's insert fails and the caller retries after rollback, then sees the winner's row.
     */
    @Transactional(noRollbackFor = GenerationException.class)
    public Start start(PresentationAiEdit candidate) {
        var existing = edits.findByUserIdAndRequestId(candidate.getUserId(), candidate.getRequestId());
        if (existing.isPresent()) return existing(existing.get(), candidate.getRequestHash());
        Instant now = clock.instant();
        if (edits.countByUserIdAndCreatedAtAfter(
                        candidate.getUserId(), now.minus(AiEditPolicy.QUOTA_WINDOW))
                >= AiEditPolicy.MAX_TEXT_EDITS_PER_DAY)
            throw limitReached(quota(candidate.getUserId(), now).resetsAt());
        edits.saveAndFlush(candidate);
        return new Start(candidate.getId(), null);
    }

    private Start existing(PresentationAiEdit edit, String requestHash) {
        if (!edit.getRequestHash().equals(requestHash))
            throw new GenerationException(GenerationError.IDEMPOTENCY_CONFLICT);
        switch (edit.getStatus()) {
            case RUNNING -> {
                Instant now = clock.instant();
                if (edit.getCreatedAt().isAfter(now.minus(AiEditPolicy.STALE_AFTER)))
                    throw new GenerationException(GenerationError.AI_EDIT_IN_PROGRESS);
                edit.fail(GenerationError.AI_EDIT_FAILED.code(), null, now);
                throw new GenerationException(GenerationError.AI_EDIT_FAILED);
            }
            case FAILED -> throw new GenerationException(GenerationError.AI_EDIT_FAILED);
            default -> {
                TextEditView stored = json.readValue(edit.getResultJson(), TextEditView.class);
                return new Start(edit.getId(), stored.asReplay());
            }
        }
    }

    /**
     * Stores the outcome; the quota in the response is computed after the insert of this edit.
     *
     * @param view builds the response from the current quota
     */
    @Transactional
    public TextEditView complete(
            UUID editId,
            AiEditStatus status,
            ResponsesUsage usage,
            Function<AiQuotaView, TextEditView> view) {
        PresentationAiEdit edit = edits.findById(editId).orElseThrow();
        Instant now = clock.instant();
        TextEditView result = view.apply(quota(edit.getUserId(), now));
        edit.complete(status, json.writeValueAsString(result), usage, now);
        return result;
    }

    /** Marks the edit failed; a retry with the same request id gets the same error. */
    @Transactional
    public void fail(UUID editId, String errorCode, ResponsesUsage usage) {
        edits.findById(editId).orElseThrow().fail(errorCode, usage, clock.instant());
    }

    /**
     * The 429 body has only {@code code} and {@code message}, so the message carries the reset time:
     * Moscow time for people and ISO-8601 UTC for the client.
     */
    static GenerationException limitReached(Instant resetsAt) {
        return new GenerationException(
                GenerationError.AI_EDIT_LIMIT,
                BackendMessages.text(
                        "presentation.error.ai-edit-limit-reset",
                        AiEditPolicy.MAX_TEXT_EDITS_PER_DAY,
                        RESET_TIME.format(resetsAt),
                        resetsAt.toString()));
    }

    private AiQuotaView quota(UUID userId, Instant now) {
        Instant since = now.minus(AiEditPolicy.QUOTA_WINDOW);
        long used = edits.countByUserIdAndCreatedAtAfter(userId, since);
        Instant oldest = edits.findOldestCreatedAtAfter(userId, since).orElse(now);
        return new AiQuotaView(
                AiEditPolicy.MAX_TEXT_EDITS_PER_DAY,
                (int) Math.max(0, AiEditPolicy.MAX_TEXT_EDITS_PER_DAY - used),
                oldest.plus(AiEditPolicy.QUOTA_WINDOW).truncatedTo(ChronoUnit.SECONDS));
    }

    /**
     * @param editId id of the new or the replayed edit
     * @param replay stored response when the request was already completed, otherwise {@code null}
     */
    public record Start(UUID editId, TextEditView replay) {}
}
