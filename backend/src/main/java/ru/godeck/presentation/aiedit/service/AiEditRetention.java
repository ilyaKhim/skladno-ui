package ru.godeck.presentation.aiedit.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Pageable;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import ru.godeck.presentation.aiedit.policy.AiEditPolicy;
import ru.godeck.presentation.aiedit.repository.PresentationAiEditRepository;
import ru.godeck.presentation.model.AiOperation;
import ru.godeck.presentation.repository.PresentationAiCallRepository;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.function.Consumer;
import java.util.function.Supplier;

/**
 * Daily removal of AI text-edit data older than {@link AiEditPolicy#RETENTION}.
 *
 * <p>Deletes journal rows of {@code presentation_ai_edits} and {@code presentation_ai_calls} rows
 * with operation {@code TEXT_EDIT}. Generation and studio chat records are not touched: their
 * retention is a separate product decision. Each batch is its own short transaction, so a large
 * backlog never holds long locks.
 */
@Service
public class AiEditRetention {
    private static final Logger log = LoggerFactory.getLogger(AiEditRetention.class);
    private final PresentationAiEditRepository edits;
    private final PresentationAiCallRepository calls;
    private final Clock clock;

    public AiEditRetention(
            PresentationAiEditRepository edits, PresentationAiCallRepository calls, Clock clock) {
        this.edits = edits;
        this.calls = calls;
        this.clock = clock;
    }

    @Scheduled(cron = "${godeck.ai-edit.retention-cron:0 17 3 * * *}", zone = "UTC")
    public void scheduled() {
        purge();
    }

    /**
     * Deletes expired text-edit data in batches of {@link AiEditPolicy#RETENTION_BATCH_SIZE}.
     *
     * @return number of deleted edit rows and provider-call rows
     */
    public long purge() {
        Instant cutoff = clock.instant().minus(AiEditPolicy.RETENTION);
        Pageable batch = Pageable.ofSize(AiEditPolicy.RETENTION_BATCH_SIZE);
        long deletedEdits =
                deleteInBatches(
                        () -> edits.findIdsCreatedBefore(cutoff, batch), edits::deleteAllByIdInBatch);
        long deletedCalls =
                deleteInBatches(
                        () -> calls.findIdsStartedBefore(AiOperation.TEXT_EDIT, cutoff, batch),
                        calls::deleteAllByIdInBatch);
        if (deletedEdits + deletedCalls > 0)
            log.info(
                    "AI edit retention: edits={} calls={} before={}",
                    deletedEdits,
                    deletedCalls,
                    cutoff);
        return deletedEdits + deletedCalls;
    }

    private static long deleteInBatches(
            Supplier<List<UUID>> nextBatch, Consumer<List<UUID>> delete) {
        long deleted = 0;
        while (true) {
            List<UUID> ids = nextBatch.get();
            if (ids.isEmpty()) return deleted;
            delete.accept(ids);
            deleted += ids.size();
            if (ids.size() < AiEditPolicy.RETENTION_BATCH_SIZE) return deleted;
        }
    }
}
