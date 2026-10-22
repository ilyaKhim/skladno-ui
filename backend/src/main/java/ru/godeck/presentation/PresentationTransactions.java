package ru.godeck.presentation;

import static ru.godeck.presentation.PresentationStatus.*;

import org.springframework.dao.DataAccessException;
import org.springframework.dao.PessimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ru.godeck.presentation.persistence.*;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

@Service
@Transactional
class PresentationTransactions {
    private static final Duration WORK_TIMEOUT = Duration.ofMinutes(5);
    private final PresentationRepository presentations;
    private final PresentationRevisionRepository revisions;
    private final PresentationModelCatalog models;
    private final Clock clock;

    PresentationTransactions(
            PresentationRepository presentations,
            PresentationRevisionRepository revisions,
            PresentationModelCatalog models,
            Clock clock) {
        this.presentations = presentations;
        this.revisions = revisions;
        this.models = models;
        this.clock = clock;
    }

    Optional<Job> claim() {
        Instant now = clock.instant();
        presentations.failInterrupted(now.minus(WORK_TIMEOUT), now, RUNNING, FAILED);
        return presentations
                .findNextQueuedForUpdate()
                .map(
                        p -> {
                            p.start(now);
                            return new Job(
                                    p.getId(),
                                    p.getTopic(),
                                    p.getMode(),
                                    models.resolve(p.getModel()),
                                    p.getContentJson());
                        });
    }

    void complete(Job job, String json, String path, int slideCount) {
        Presentation p =
                presentations
                        .findForCompletion(job.id())
                        .orElseThrow(PresentationTransactions::missing);
        if (p.getStatus() != RUNNING)
            throw new GenerationException(
                    409, "worker_interrupted", "Задача уже завершена другим процессом.");
        p.succeed(json, path, slideCount, job.model(), 1, clock.instant());
        revisions.save(
                new PresentationRevision(
                        p.getId(),
                        p.getUserId(),
                        1,
                        "Исходная версия",
                        "Презентация создана.",
                        json,
                        path,
                        slideCount,
                        job.mode() == GenerationMode.MANUAL ? null : job.model(),
                        clock.instant()));
    }

    void fail(UUID id, String code) {
        presentations
                .findForCompletion(id)
                .filter(p -> p.getStatus() == RUNNING)
                .ifPresent(p -> p.fail(code, clock.instant()));
    }

    Edit beginEdit(UUID userId, UUID id, String requestedModel) {
        Presentation p;
        try {
            p =
                    presentations
                            .findForUpdate(id, userId)
                            .orElseThrow(PresentationTransactions::missing);
        } catch (DataAccessException e) {
            if (e instanceof PessimisticLockingFailureException
                    || e.getMostSpecificCause() instanceof java.sql.SQLException sql
                            && "55P03".equals(sql.getSQLState())) throw editing();
            throw e;
        }
        Instant now = clock.instant();
        if (p.getStatus() != SUCCEEDED)
            throw new GenerationException(
                    409, "presentation_not_ready", "Чат доступен после создания презентации.");
        if (p.getContentJson() == null)
            throw new GenerationException(
                    409,
                    "content_unavailable",
                    "Для этой старой презентации не сохранён план. Создайте новую презентацию.");
        if (p.getEditId() != null && p.getEditStartedAt().isAfter(now.minus(WORK_TIMEOUT)))
            throw editing();
        if (revisions.countByUserIdAndVersionGreaterThanAndCreatedAtAfter(
                        userId, 1, now.minus(Duration.ofDays(1)))
                >= 30) {
            throw new GenerationException(429, "edit_limit", "Достигнут дневной лимит правок.");
        }
        String model =
                models.resolve(
                        requestedModel == null || requestedModel.isBlank()
                                ? p.getModel()
                                : requestedModel);
        UUID token = UUID.randomUUID();
        p.beginEdit(token, now);
        return new Edit(
                id, userId, token, p.getCurrentVersion(), p.getTopic(), model, p.getContentJson());
    }

    PresentationDtos.View completeEdit(
            Edit edit, String message, String json, String path, int count) {
        Presentation p =
                presentations
                        .findForCompletion(edit.id())
                        .orElseThrow(PresentationTransactions::missing);
        if (!edit.token().equals(p.getEditId()) || p.getCurrentVersion() != edit.baseVersion()) {
            throw new GenerationException(
                    409, "edit_expired", "Правка устарела. Повторите запрос.");
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
                        "Обновил содержание и пересобрал презентацию по вашему запросу.",
                        json,
                        path,
                        count,
                        edit.model(),
                        clock.instant()));
        return PresentationDtos.View.from(p);
    }

    void releaseEdit(Edit edit) {
        presentations
                .findForCompletion(edit.id())
                .filter(p -> edit.token().equals(p.getEditId()))
                .ifPresent(Presentation::clearEdit);
    }

    private static GenerationException editing() {
        return new GenerationException(
                409, "edit_in_progress", "Дождитесь завершения предыдущей правки.");
    }

    private static GenerationException missing() {
        return new GenerationException(404, "presentation_not_found", "Презентация не найдена.");
    }

    record Job(UUID id, String topic, GenerationMode mode, String model, String contentJson) {}

    record Edit(
            UUID id,
            UUID userId,
            UUID token,
            int baseVersion,
            String topic,
            String model,
            String contentJson) {}
}
