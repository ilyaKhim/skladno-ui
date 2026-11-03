package ru.godeck.presentation.aiedit.repository;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import ru.godeck.presentation.aiedit.core.AiEditStatus;
import ru.godeck.presentation.aiedit.core.TargetKind;
import ru.godeck.presentation.aiedit.entity.PresentationAiEdit;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PresentationAiEditRepository extends JpaRepository<PresentationAiEdit, UUID> {
    /** Idempotency lookup; {@code (user_id, request_id)} is unique. */
    Optional<PresentationAiEdit> findByUserIdAndRequestId(UUID userId, UUID requestId);

    /** Quota usage in the rolling window, including running and failed edits. */
    long countByUserIdAndCreatedAtAfter(UUID userId, Instant since);

    /** Oldest edit in the window: the quota unit that is released first. */
    @Query(
            "select min(e.createdAt) from PresentationAiEdit e where e.userId=:userId and"
                    + " e.createdAt>:since")
    Optional<Instant> findOldestCreatedAtAfter(UUID userId, Instant since);

    /** A refined edit must belong to the same user, presentation and target. */
    boolean existsByIdAndUserIdAndPresentationIdAndTargetKindAndTargetRef(
            UUID id, UUID userId, UUID presentationId, TargetKind targetKind, String targetRef);

    /** First page of the feed: finished records that were not cleared, newest first. */
    @Query(
            "select e from PresentationAiEdit e where e.presentationId=:presentationId and"
                    + " e.userId=:userId and e.clearedAt is null and e.status<>:hidden"
                    + " order by e.createdAt desc, e.id desc")
    List<PresentationAiEdit> findHistory(
            UUID presentationId, UUID userId, AiEditStatus hidden, Pageable page);

    /** Next page of the feed after the keyset position {@code (createdAt, id)}. */
    @Query(
            "select e from PresentationAiEdit e where e.presentationId=:presentationId and"
                    + " e.userId=:userId and e.clearedAt is null and e.status<>:hidden and"
                    + " (e.createdAt<:createdAt or (e.createdAt=:createdAt and e.id<:id))"
                    + " order by e.createdAt desc, e.id desc")
    List<PresentationAiEdit> findHistoryBefore(
            UUID presentationId,
            UUID userId,
            AiEditStatus hidden,
            Instant createdAt,
            UUID id,
            Pageable page);

    Optional<PresentationAiEdit> findByIdAndUserIdAndPresentationId(
            UUID id, UUID userId, UUID presentationId);

    /** @return number of updated rows; zero when the record is gone or was cleared meanwhile */
    @Modifying
    @Query(
            "update PresentationAiEdit e set e.outcome=:outcome, e.outcomeVariant=:variant,"
                    + " e.outcomeAt=:at where e.id=:id and e.userId=:userId and"
                    + " e.presentationId=:presentationId and e.clearedAt is null")
    int recordOutcome(
            UUID id, UUID userId, UUID presentationId, String outcome, Short variant, Instant at);

    /** Closes abandoned edits: no live request can still be behind a row older than the deadline. */
    @Modifying
    @Query(
            "update PresentationAiEdit e set e.status=:failed, e.errorCode=:errorCode,"
                    + " e.failureReason=:failureReason, e.completedAt=:at where"
                    + " e.presentationId=:presentationId and e.userId=:userId and e.status=:running"
                    + " and e.createdAt<:staleBefore")
    int failStale(
            UUID presentationId,
            UUID userId,
            AiEditStatus running,
            AiEditStatus failed,
            String errorCode,
            String failureReason,
            Instant staleBefore,
            Instant at);

    /** Removes the texts of the feed and keeps rows: quota and idempotency rest on them. */
    @Modifying
    @Query(
            "update PresentationAiEdit e set e.paramsJson=:params, e.resultJson=null,"
                    + " e.clearedAt=:at where e.presentationId=:presentationId and"
                    + " e.userId=:userId and e.status<>:running and e.clearedAt is null")
    int clearHistory(
            UUID presentationId, UUID userId, AiEditStatus running, String params, Instant at);

    /** One retention batch: ids of edits created before the cutoff, oldest first. */
    @Query("select e.id from PresentationAiEdit e where e.createdAt<:before order by e.createdAt")
    List<UUID> findIdsCreatedBefore(Instant before, Pageable batch);
}
