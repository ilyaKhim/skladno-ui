package ru.godeck.presentation.repository;

import org.springframework.data.jpa.repository.JpaRepository;

import ru.godeck.presentation.entity.PresentationRevision;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface PresentationRevisionRepository extends JpaRepository<PresentationRevision, UUID> {
    List<PresentationRevision> findByPresentationIdAndUserIdOrderByVersion(
            UUID presentationId, UUID userId);

    long countByUserIdAndVersionGreaterThanAndCreatedAtAfter(
            UUID userId, int version, Instant since);
}
