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

    public void fail(UUID id, String code) {
        presentations
                .findForCompletion(id)
                .filter(p -> p.getStatus() == RUNNING)
                .ifPresent(p -> p.fail(code, clock.instant()));
    }

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

    public void releaseEdit(Edit edit) {
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

    public record Job(
            UUID id,
            String templateId,
            String topic,
            GenerationMode mode,
            String model,
            String contentJson) {}

    public record Edit(
            UUID id,
            UUID userId,
            UUID token,
            int baseVersion,
            String templateId,
            String topic,
            String model,
            String contentJson) {}
}
