package ru.godeck.presentation.repository;

import org.springframework.data.jpa.repository.JpaRepository;

import ru.godeck.presentation.entity.PresentationRevision;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PresentationRevisionRepository extends JpaRepository<PresentationRevision, UUID> {
    List<PresentationRevision> findByPresentationIdAndUserIdOrderByVersion(
            UUID presentationId, UUID userId);

    Optional<PresentationRevision> findByPresentationIdAndUserIdAndVersion(
            UUID presentationId, UUID userId, int version);

    long countByUserIdAndVersionGreaterThanAndCreatedAtAfter(
            UUID userId, int version, Instant since);
}
