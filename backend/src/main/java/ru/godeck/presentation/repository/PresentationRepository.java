package ru.godeck.presentation.repository;

import jakarta.persistence.LockModeType;
import jakarta.persistence.QueryHint;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.QueryHints;

import ru.godeck.presentation.entity.Presentation;
import ru.godeck.presentation.model.PresentationStatus;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PresentationRepository extends JpaRepository<Presentation, UUID> {
    Optional<Presentation> findByIdAndUserId(UUID id, UUID userId);

    Optional<Presentation> findByUserIdAndIdempotencyKey(UUID userId, String key);

    /**
     * Keeps unfinished human review discoverable on the first history page. The pageable still
     * supplies the existing created-at/id descending order within each priority group.
     */
    @Query(
            "select p from Presentation p where p.userId=:userId order by case when"
                + " p.status=ru.godeck.presentation.model.PresentationStatus.AWAITING_REVIEW then 0"
                + " else 1 end")
    List<Presentation> findByUserId(UUID userId, Pageable pageable);

    long countByUserId(UUID userId);

    long countByUserIdAndCreatedAtAfter(UUID userId, Instant since);

    long countByUserIdAndStatusIn(UUID userId, Collection<PresentationStatus> statuses);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @QueryHints(@QueryHint(name = "jakarta.persistence.lock.timeout", value = "0"))
    @Query("select p from Presentation p where p.id=:id and p.userId=:userId")
    Optional<Presentation> findForUpdate(UUID id, UUID userId);

    /**
     * Short outline transactions wait for each other, allowing concurrent confirm retries to be
     * idempotent.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from Presentation p where p.id=:id and p.userId=:userId")
    Optional<Presentation> findOutlineForUpdate(UUID id, UUID userId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from Presentation p where p.id=:id")
    Optional<Presentation> findForCompletion(UUID id);

    // SKIP LOCKED permits multiple API instances to claim different jobs atomically.
    @Query(
            value =
                    "SELECT * FROM generated_presentations WHERE status='queued' ORDER BY"
                            + " created_at,id FOR UPDATE SKIP LOCKED LIMIT 1",
            nativeQuery = true)
    Optional<Presentation> findNextQueuedForUpdate();

    @Modifying(clearAutomatically = true)
    @Query(
            "update Presentation p set p.status=:failed,p.errorCode=:errorCode,p.updatedAt=:now,"
                + " p.generationInputExpiresAt=case when p.generationInputJson is not null and"
                + " p.generationInputExpiresAt is null then :inputExpiry else"
                + " p.generationInputExpiresAt end where p.status=:running and p.updatedAt<:before")
    int failInterrupted(
            Instant before,
            Instant now,
            PresentationStatus running,
            PresentationStatus failed,
            String errorCode,
            Instant inputExpiry);

    // PostgreSQL's unique constraint makes retries safe even for concurrent create requests.
    @Modifying
    @Query(
            value =
                    """
                    INSERT INTO generated_presentations
                        (id, user_id, template_id, topic, status, mode,
                         idempotency_key, request_hash, model, created_at, updated_at, current_version,
                         generation_input_json, review_before_render)
                    VALUES (:id, :userId, :templateId, :topic, :status, :mode,
                            :key, :hash, :model, :now, :now, :initialVersion, :generationInputJson, :reviewBeforeRender)
                    ON CONFLICT (user_id, idempotency_key) DO NOTHING
                    """,
            nativeQuery = true)
    int insertIfAbsent(
            UUID id,
            UUID userId,
            String templateId,
            String topic,
            String status,
            String mode,
            String key,
            String hash,
            String model,
            Instant now,
            int initialVersion,
            String generationInputJson,
            boolean reviewBeforeRender);

    /**
     * Deletes only source/context snapshots of terminal jobs; queued/running jobs retain their
     * input.
     */
    @Modifying(clearAutomatically = true)
    @Query(
            value =
                    "UPDATE generated_presentations SET"
                        + " generation_input_json=NULL,generation_input_expires_at=NULL WHERE"
                        + " generation_input_json IS NOT NULL AND status IN"
                        + " ('succeeded','failed','cancelled') AND generation_input_expires_at <="
                        + " :now",
            nativeQuery = true)
    int clearExpiredGenerationInputs(Instant now);
}
