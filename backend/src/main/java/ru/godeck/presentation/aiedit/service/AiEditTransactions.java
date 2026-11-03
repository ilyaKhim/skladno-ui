package ru.godeck.presentation.aiedit.service;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ru.godeck.common.text.BackendMessages;
import ru.godeck.presentation.aiedit.ai.ResponsesUsage;
import ru.godeck.presentation.aiedit.core.AiEditFailureReason;
import ru.godeck.presentation.aiedit.core.AiEditStatus;
import ru.godeck.presentation.aiedit.dto.AiQuotaView;
import ru.godeck.presentation.aiedit.dto.TextEditView;
import ru.godeck.presentation.aiedit.entity.PresentationAiEdit;
import ru.godeck.presentation.aiedit.config.AiEditSettings;
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
    /** First key of the two-key advisory lock; the second key is derived from the user id. */
    private static final int QUOTA_LOCK = 71983403;

    private final PresentationAiEditRepository edits;
    private final JdbcClient db;
    private final ObjectMapper json;
    private final Clock clock;
    private final AiEditSettings settings;

    public AiEditTransactions(
            PresentationAiEditRepository edits,
            JdbcClient db,
            ObjectMapper json,
            Clock clock,
            AiEditSettings settings) {
        this.edits = edits;
        this.db = db;
        this.json = json;
        this.clock = clock;
        this.settings = settings;
    }

    /**
     * Resolves idempotency, checks the quota and inserts a {@code running} edit.
     *
     * <ul>
     *   <li>same request id with another hash: {@code idempotency_conflict};
     *   <li>still running and younger than the configured stale deadline: {@code
     *       ai_edit_in_progress};
     *   <li>running but stale: marked failed, {@code ai_edit_failed};
     *   <li>completed: the stored response with {@code replayed: true}, no quota spent;
     *   <li>cleared from the feed: {@code ai_edit_failed}, the stored response is gone;
     *   <li>failed: {@code ai_edit_failed} again.
     * </ul>
     *
     * Otherwise reaching the configured quota in the window gives {@code
     * ai_edit_limit}. A per-user lock held until commit serializes these steps, so concurrent
     * requests cannot pass the quota check together, and a duplicate of a running request sees its
     * row instead of the quota error. Different users do not wait for each other.
     */
    @Transactional(noRollbackFor = GenerationException.class)
    public Start start(PresentationAiEdit candidate) {
        db.sql("SELECT pg_advisory_xact_lock(?, ?)")
                .params(QUOTA_LOCK, candidate.getUserId().hashCode())
                .query(Object.class)
                .single();
        var existing = edits.findByUserIdAndRequestId(candidate.getUserId(), candidate.getRequestId());
        if (existing.isPresent()) return existing(existing.get(), candidate.getRequestHash());
        Instant now = clock.instant();
        if (edits.countByUserIdAndCreatedAtAfter(
                        candidate.getUserId(), now.minus(settings.quotaWindow()))
                >= settings.maxEditsPerWindow())
            throw limitReached(quota(candidate.getUserId(), now).resetsAt());
        edits.saveAndFlush(candidate);
        return new Start(candidate.getId(), null);
    }

    private Start existing(PresentationAiEdit edit, String requestHash) {
        if (!edit.getRequestHash().equals(requestHash))
            throw new GenerationException(GenerationError.IDEMPOTENCY_CONFLICT);
        if (edit.getClearedAt() != null)
            throw new GenerationException(GenerationError.AI_EDIT_FAILED);
        switch (edit.getStatus()) {
            case RUNNING -> {
                Instant now = clock.instant();
                if (edit.getCreatedAt().isAfter(now.minus(settings.staleAfter())))
                    throw new GenerationException(GenerationError.AI_EDIT_IN_PROGRESS);
                edit.fail(
                        GenerationError.AI_EDIT_FAILED.code(),
                        null,
                        AiEditFailureReason.INTERNAL,
                        null,
                        now);
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
     * @param telemetry numbers and codes of this edit
     * @param view builds the response from the current quota
     */
    @Transactional
    public TextEditView complete(
            UUID editId,
            AiEditStatus status,
            Telemetry telemetry,
            Function<AiQuotaView, TextEditView> view) {
        PresentationAiEdit edit = edits.findById(editId).orElseThrow();
        // The feed was cleared after this row went stale: its texts must not come back.
        if (edit.getClearedAt() != null)
            throw new GenerationException(GenerationError.AI_EDIT_FAILED);
        Instant now = clock.instant();
        TextEditView result = view.apply(quota(edit.getUserId(), now));
        edit.complete(
                status,
                json.writeValueAsString(result),
                telemetry.usage(),
                telemetry.alternativeReason(),
                telemetry.factGuard(),
                telemetry.durationMs(),
                now);
        return result;
    }

    /** Marks the edit failed; a retry with the same request id gets the same error. */
    @Transactional
    public void fail(
            UUID editId,
            String errorCode,
            ResponsesUsage usage,
            AiEditFailureReason failureReason,
            long durationMs) {
        edits.findById(editId)
                .orElseThrow()
                .fail(errorCode, usage, failureReason, durationMs, clock.instant());
    }

    /**
     * The 429 body has only {@code code} and {@code message}, so the message carries the reset time:
     * Moscow time for people and ISO-8601 UTC for the client.
     */
    private GenerationException limitReached(Instant resetsAt) {
        return new GenerationException(
                GenerationError.AI_EDIT_LIMIT,
                BackendMessages.text(
                        "presentation.error.ai-edit-limit-reset",
                        settings.maxEditsPerWindow(),
                        RESET_TIME.format(resetsAt),
                        resetsAt.toString()));
    }

    private AiQuotaView quota(UUID userId, Instant now) {
        Instant since = now.minus(settings.quotaWindow());
        long used = edits.countByUserIdAndCreatedAtAfter(userId, since);
        Instant oldest = edits.findOldestCreatedAtAfter(userId, since).orElse(now);
        return new AiQuotaView(
                settings.maxEditsPerWindow(),
                (int) Math.max(0, settings.maxEditsPerWindow() - used),
                oldest.plus(settings.quotaWindow()).truncatedTo(ChronoUnit.SECONDS));
    }

    /**
     * @param editId id of the new or the replayed edit
     * @param replay stored response when the request was already completed, otherwise {@code null}
     */
    public record Start(UUID editId, TextEditView replay) {}

    /**
     * Journal values of a completed edit; codes and numbers only.
     *
     * @param alternativeReason value of {@code reason}, or {@code null}
     * @param factGuard strongest {@code FactGuard} action
     * @param durationMs time of the whole request
     */
    public record Telemetry(
            ResponsesUsage usage, String alternativeReason, String factGuard, long durationMs) {}
}
