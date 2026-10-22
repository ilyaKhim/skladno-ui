package ru.godeck.presentation.dto;

import ru.godeck.presentation.entity.PresentationRevision;

import tools.jackson.databind.PropertyNamingStrategies;
import tools.jackson.databind.annotation.JsonNaming;

@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public record PresentationRevisionView(
        int version,
        String message,
        String reply,
        int slideCount,
        String model,
        long createdAt,
        String downloadUrl) {
    public static PresentationRevisionView from(PresentationRevision r) {
        return new PresentationRevisionView(
                r.getVersion(),
                r.getMessage(),
                r.getReply(),
                r.getSlideCount(),
                r.getModel() == null ? "" : r.getModel(),
                r.getCreatedAt().getEpochSecond(),
                "/api/generation/v1/presentations/"
                        + r.getPresentationId()
                        + "/versions/"
                        + r.getVersion()
                        + "/download");
    }
}
