package ru.godeck.presentation.ai;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface PresentationAiCallRepository extends JpaRepository<PresentationAiCall, UUID> {
    List<PresentationAiCall> findByPresentationIdOrderByStartedAtDesc(UUID presentationId);

    /** One retention batch: ids of one operation's calls started before the cutoff. */
    @Query(
            "select c.id from PresentationAiCall c where c.operation=:operation and"
                    + " c.startedAt<:before order by c.startedAt")
    List<UUID> findIdsStartedBefore(AiOperation operation, Instant before, Pageable batch);

    /** Removes finished or abandoned calls; a call in progress still has to record its result. */
    @Modifying
    @Query(
            "delete from PresentationAiCall c where c.presentationId=:presentationId and"
                    + " c.operation=:operation and (c.completedAt is not null or"
                    + " c.startedAt<:staleBefore)")
    int deleteFinished(UUID presentationId, AiOperation operation, Instant staleBefore);
}
