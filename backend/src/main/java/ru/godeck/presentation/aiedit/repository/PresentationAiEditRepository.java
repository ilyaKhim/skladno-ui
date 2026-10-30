package ru.godeck.presentation.aiedit.repository;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

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

    /** A refined edit must belong to the same user and presentation. */
    boolean existsByIdAndUserIdAndPresentationId(UUID id, UUID userId, UUID presentationId);

    /** One retention batch: ids of edits created before the cutoff, oldest first. */
    @Query("select e.id from PresentationAiEdit e where e.createdAt<:before order by e.createdAt")
    List<UUID> findIdsCreatedBefore(Instant before, Pageable batch);
}
