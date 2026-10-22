package ru.godeck.presentation.dto;

import ru.godeck.presentation.entity.Presentation;
import ru.godeck.presentation.model.GenerationMode;
import ru.godeck.presentation.model.PresentationStatus;

import tools.jackson.databind.PropertyNamingStrategies;
import tools.jackson.databind.annotation.JsonNaming;

import java.util.UUID;

@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public record PresentationView(
        UUID id,
        String templateId,
        String topic,
        GenerationMode mode,
        String model,
        PresentationStatus status,
        long createdAt,
        long updatedAt,
        String errorCode,
        Integer slideCount,
        int version,
        String downloadUrl) {
    public static PresentationView from(Presentation p) {
        return new PresentationView(
                p.getId(),
                p.getTemplateId(),
                p.getTopic(),
                p.getMode(),
                p.getModel(),
                p.getStatus(),
                p.getCreatedAt().getEpochSecond(),
                p.getUpdatedAt().getEpochSecond(),
                p.getErrorCode(),
                p.getSlideCount(),
                p.getCurrentVersion(),
                p.getStatus() == PresentationStatus.SUCCEEDED
                        ? "/api/generation/v1/presentations/" + p.getId() + "/download"
                        : null);
    }
}
