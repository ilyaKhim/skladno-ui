package ru.godeck.presentation.repository;

import org.springframework.data.jpa.repository.JpaRepository;

import ru.godeck.presentation.entity.PresentationAiCall;

import java.util.List;
import java.util.UUID;

public interface PresentationAiCallRepository extends JpaRepository<PresentationAiCall, UUID> {
    List<PresentationAiCall> findByPresentationIdOrderByStartedAtDesc(UUID presentationId);
}
