package ru.godeck.presentation.ai;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
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
}
