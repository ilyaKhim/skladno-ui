package ru.godeck.presentation.service;

import static ru.godeck.presentation.model.PresentationStatus.*;

import org.springframework.dao.DataAccessException;
import org.springframework.dao.PessimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ru.godeck.common.text.BackendMessages;
import ru.godeck.presentation.ai.PresentationModelCatalog;
import ru.godeck.presentation.dto.PresentationView;
import ru.godeck.presentation.entity.Presentation;
import ru.godeck.presentation.entity.PresentationRevision;
import ru.godeck.presentation.exception.GenerationError;
import ru.godeck.presentation.exception.GenerationException;
import ru.godeck.presentation.model.GenerationMode;
import ru.godeck.presentation.policy.PresentationPolicy;
import ru.godeck.presentation.repository.PresentationRepository;
import ru.godeck.presentation.repository.PresentationRevisionRepository;

import java.time.Clock;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

/**
 * Defines the short transactional boundaries around long-running presentation work.
 *
 * <p>AI calls, Apache POI rendering, and filesystem writes must not hold database locks. This
 * service therefore claims or reserves work in one transaction, lets an orchestrator perform slow
 * work outside the transaction, and verifies the captured token/version again in a final
 * transaction. The records returned by begin methods are immutable snapshots that carry exactly
 * the evidence required for safe completion.
 */
@Service
@Transactional
public class PresentationTransactions {
    private static final String POSTGRES_LOCK_NOT_AVAILABLE = "55P03";
    private final PresentationRepository presentations;
    private final PresentationRevisionRepository revisions;
    private final PresentationModelCatalog models;
    private final Clock clock;

    public PresentationTransactions(
            PresentationRepository presentations,
            PresentationRevisionRepository revisions,
            PresentationModelCatalog models,
            Clock clock) {
        this.presentations = presentations;
        this.revisions = revisions;
        this.models = models;
        this.clock = clock;
    }

    /**
     * Atomically claims the next queued presentation for one worker.
     *
     * <p>Before claiming, stale {@code running} jobs are failed so a process crash cannot block the
     * queue forever. The repository uses {@code FOR UPDATE SKIP LOCKED}; multiple workers can claim
     * different rows without waiting for each other.
     *
     * @return immutable job snapshot, or empty when the queue has no claimable row
     */
    public Optional<Job> claim() {
        Instant now = clock.instant();
        presentations.failInterrupted(
                now.minus(PresentationPolicy.GENERATION_TIMEOUT),
                now,
                RUNNING,
                FAILED,
                GenerationError.WORKER_INTERRUPTED.code());
        return presentations
                .findNextQueuedForUpdate()
                .map(
                        p -> {
                            p.start(now);
                            return new Job(
                                    p.getId(),
                                    p.getTemplateId(),
                                    p.getTopic(),
                                    p.getMode(),
                                    p.getModel(),
                                    p.getContentJson());
                        });
    }

    /**
     * Publishes the initial generated file and creates version one in the same transaction.
     *
     * <p>Coupling presentation state and revision insertion guarantees that a succeeded project
     * always has a matching immutable revision record.
     *
     * @param job claimed work item
     * @param json normalized semantic content that produced the file
     * @param path safely written PPTX path
     * @param slideCount number of included slides
     */
    public void complete(Job job, String json, String path, int slideCount) {
        Presentation p =
                presentations
                        .findForCompletion(job.id())
                        .orElseThrow(PresentationTransactions::missing);
        if (p.getStatus() != RUNNING)
            throw new GenerationException(GenerationError.WORKER_INTERRUPTED);
        p.succeed(
                json,
                path,
                slideCount,
                job.model(),
                PresentationPolicy.INITIAL_VERSION,
                clock.instant());
        revisions.save(
                new PresentationRevision(
                        p.getId(),
                        p.getUserId(),
                        PresentationPolicy.INITIAL_VERSION,
                        BackendMessages.text("presentation.revision.initial-message"),
                        BackendMessages.text("presentation.revision.initial-reply"),
                        json,
                        path,
                        slideCount,
                        job.mode() == GenerationMode.MANUAL ? null : job.model(),
                        clock.instant()));
    }

    /**
     * Marks a claimed job failed only while it is still running.
     *
     * <p>The state guard prevents a late worker error from overwriting a terminal state written by
     * another recovery path.
     */
    public void fail(UUID id, String code) {
        presentations
                .findForCompletion(id)
                .filter(p -> p.getStatus() == RUNNING)
                .ifPresent(p -> p.fail(code, clock.instant()));
    }

    /**
     * Reserves an AI edit and captures the published document it is allowed to modify.
     *
     * <p>The row is locked with fail-fast semantics. Existing editor drafts block AI edits because
     * generating from older {@code content_json} would discard unpublished manual work. The random
     * token and base version later prevent stale results from committing.
     *
     * @param userId owner of the presentation
     * @param id presentation being edited
     * @param requestedModel optional model override
     * @return immutable AI edit snapshot used outside the transaction
     */
    public Edit beginEdit(UUID userId, UUID id, String requestedModel) {
        Presentation p;
        try {
            p =
                    presentations
                            .findForUpdate(id, userId)
                            .orElseThrow(PresentationTransactions::missing);
        } catch (DataAccessException e) {
            if (e instanceof PessimisticLockingFailureException
                    || e.getMostSpecificCause() instanceof java.sql.SQLException sql
                            && POSTGRES_LOCK_NOT_AVAILABLE.equals(sql.getSQLState()))
                throw editing();
            throw e;
        }
        Instant now = clock.instant();
        if (p.getStatus() != SUCCEEDED)
            throw new GenerationException(GenerationError.PRESENTATION_NOT_READY);
        if (p.getContentJson() == null)
            throw new GenerationException(GenerationError.CONTENT_UNAVAILABLE);
        if (p.getEditorJson() != null)
            throw new GenerationException(GenerationError.EDIT_IN_PROGRESS);
        if (p.getEditId() != null
                && p.getEditStartedAt().isAfter(now.minus(PresentationPolicy.EDIT_LEASE_TIMEOUT)))
            throw editing();
        if (revisions.countByUserIdAndVersionGreaterThanAndCreatedAtAfter(
                        userId,
                        PresentationPolicy.INITIAL_VERSION,
                        now.minus(PresentationPolicy.QUOTA_WINDOW))
                >= PresentationPolicy.MAX_EDITS_PER_DAY) {
            throw new GenerationException(GenerationError.EDIT_LIMIT);
        }
        String model =
                models.resolve(
                        requestedModel == null || requestedModel.isBlank()
                                ? p.getModel()
                                : requestedModel);
        UUID token = UUID.randomUUID();
        p.beginEdit(token, now);
        return new Edit(
                id,
                userId,
                token,
                p.getCurrentVersion(),
                p.getTemplateId(),
                p.getTopic(),
                model,
                p.getContentJson());
    }

    /**
     * Atomically publishes an AI edit if its lease token and base version are still current.
     *
     * @param edit reservation returned by {@link #beginEdit(UUID, UUID, String)}
     * @param message user instruction recorded in revision history
     * @param json semantic content rendered into the new file
     * @param path new PPTX path
     * @param count included slide count
     * @return updated presentation view
     */
    public PresentationView completeEdit(
            Edit edit, String message, String json, String path, int count) {
        Presentation p =
                presentations
                        .findForCompletion(edit.id())
                        .orElseThrow(PresentationTransactions::missing);
        if (!edit.token().equals(p.getEditId()) || p.getCurrentVersion() != edit.baseVersion()) {
            throw new GenerationException(GenerationError.EDIT_EXPIRED);
        }
        int version = edit.baseVersion() + 1;
        p.succeed(json, path, count, edit.model(), version, clock.instant());
        p.clearEdit();
        revisions.save(
                new PresentationRevision(
                        p.getId(),
                        p.getUserId(),
                        version,
                        message.strip(),
                        BackendMessages.text("presentation.chat.reply"),
                        json,
                        path,
                        count,
                        edit.model(),
                        clock.instant()));
        return PresentationView.from(p);
    }

    /**
     * Releases a failed AI edit only when the same token still owns the lease.
     *
     * <p>The token check prevents cleanup from an old request from clearing a newer reservation.
     */
    public void releaseEdit(Edit edit) {
        presentations
                .findForCompletion(edit.id())
                .filter(p -> edit.token().equals(p.getEditId()))
                .ifPresent(Presentation::clearEdit);
    }

    /**
     * Reserves publication of one exact editor draft revision.
     *
     * <p>Published version, draft base version, and monotonic draft revision are checked together.
     * This closes both ordinary stale-write races and the ABA case where a draft is cleared and
     * recreated while an earlier commit is still rendering.
     *
     * @param userId owner of the presentation
     * @param id presentation being published
     * @param expectedBaseVersion published version observed by the browser
     * @param expectedDraftRevision exact autosave revision selected for export
     * @return immutable commit snapshot and lease token
     */
    public EditorCommit beginEditorCommit(
            UUID userId, UUID id, int expectedBaseVersion, long expectedDraftRevision) {
        Presentation p;
        try {
            p =
                    presentations
                            .findForUpdate(id, userId)
                            .orElseThrow(PresentationTransactions::missing);
        } catch (DataAccessException e) {
            if (e instanceof PessimisticLockingFailureException
                    || e.getMostSpecificCause() instanceof java.sql.SQLException sql
                            && POSTGRES_LOCK_NOT_AVAILABLE.equals(sql.getSQLState()))
                throw editing();
            throw e;
        }
        Instant now = clock.instant();
        if (p.getStatus() != SUCCEEDED)
            throw new GenerationException(GenerationError.PRESENTATION_NOT_READY);
        if (p.getEditorJson() == null
                || p.getEditorBaseVersion() == null
                || p.getCurrentVersion() != expectedBaseVersion
                || p.getEditorBaseVersion() != expectedBaseVersion
                || p.getEditorRevision() != expectedDraftRevision)
            throw new GenerationException(GenerationError.EDIT_EXPIRED);
        if (p.getEditId() != null
                && p.getEditStartedAt().isAfter(now.minus(PresentationPolicy.EDIT_LEASE_TIMEOUT)))
            throw editing();
        if (revisions.countByUserIdAndVersionGreaterThanAndCreatedAtAfter(
                        userId,
                        PresentationPolicy.INITIAL_VERSION,
                        now.minus(PresentationPolicy.QUOTA_WINDOW))
                >= PresentationPolicy.MAX_EDITS_PER_DAY)
            throw new GenerationException(GenerationError.EDIT_LIMIT);
        UUID token = UUID.randomUUID();
        p.beginEdit(token, now);
        return new EditorCommit(
                id,
                userId,
                token,
                p.getCurrentVersion(),
                p.getEditorRevision(),
                p.getTemplateId(),
                p.getModel(),
                p.getEditorJson());
    }

    /**
     * Publishes a rendered editor snapshot if no version, revision, or lease changed meanwhile.
     *
     * <p>Success updates canonical content, increments the published version, records an immutable
     * revision, clears the draft, and bumps the draft revision so stale clients cannot reuse an old
     * identifier.
     */
    public PresentationView completeEditorCommit(
            EditorCommit edit, String json, String path, int count) {
        Presentation p =
                presentations
                        .findForCompletion(edit.id())
                        .orElseThrow(PresentationTransactions::missing);
        if (!edit.token().equals(p.getEditId())
                || p.getCurrentVersion() != edit.baseVersion()
                || p.getEditorRevision() != edit.draftRevision())
            throw new GenerationException(GenerationError.EDIT_EXPIRED);
        int version = edit.baseVersion() + 1;
        p.succeed(json, path, count, edit.model(), version, clock.instant());
        p.bumpEditorRevision(clock.instant());
        p.clearEdit();
        revisions.save(
                new PresentationRevision(
                        p.getId(),
                        p.getUserId(),
                        version,
                        BackendMessages.text("presentation.revision.editor-message"),
                        BackendMessages.text("presentation.revision.editor-reply"),
                        json,
                        path,
                        count,
                        null,
                        clock.instant()));
        return PresentationView.from(p);
    }

    /** Releases a failed editor commit without clearing a lease acquired by another request. */
    public void releaseEditorCommit(EditorCommit edit) {
        presentations
                .findForCompletion(edit.id())
                .filter(p -> edit.token().equals(p.getEditId()))
                .ifPresent(Presentation::clearEdit);
    }

    private static GenerationException editing() {
        return new GenerationException(GenerationError.EDIT_IN_PROGRESS);
    }

    private static GenerationException missing() {
        return new GenerationException(GenerationError.PRESENTATION_NOT_FOUND);
    }

    /**
     * Immutable queue claim consumed by {@code PresentationWorker} outside a transaction.
     *
     * @param id presentation identifier
     * @param templateId selected immutable template id
     * @param topic normalized user brief
     * @param mode AI or manual content source
     * @param model selected AI model, retained for manual jobs for aggregate consistency
     * @param contentJson manual content snapshot, or {@code null} for AI generation
     */
    public record Job(
            UUID id,
            String templateId,
            String topic,
            GenerationMode mode,
            String model,
            String contentJson) {}

    /**
     * Immutable AI-edit reservation carrying the lease token and published source snapshot.
     *
     * @param id presentation identifier
     * @param userId owning tenant identifier
     * @param token random lease ownership proof
     * @param baseVersion exact published version being edited
     * @param templateId selected immutable template id
     * @param topic original presentation topic
     * @param model resolved model for this edit
     * @param contentJson canonical published semantic snapshot
     */
    public record Edit(
            UUID id,
            UUID userId,
            UUID token,
            int baseVersion,
            String templateId,
            String topic,
            String model,
            String contentJson) {}

    /**
     * Immutable editor-commit reservation carrying the exact saved draft to render.
     *
     * @param id presentation identifier
     * @param userId owning tenant identifier
     * @param token random lease ownership proof
     * @param baseVersion exact published version from which the draft was derived
     * @param draftRevision exact monotonic autosave revision selected for publication
     * @param templateId selected immutable template id
     * @param model model metadata retained on the presentation aggregate
     * @param editorJson complete persisted draft captured before rendering
     */
    public record EditorCommit(
            UUID id,
            UUID userId,
            UUID token,
            int baseVersion,
            long draftRevision,
            String templateId,
            String model,
            String editorJson) {}
}
