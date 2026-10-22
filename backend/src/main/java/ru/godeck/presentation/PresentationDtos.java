package ru.godeck.presentation;

import jakarta.validation.constraints.*;

import ru.godeck.presentation.persistence.Presentation;
import ru.godeck.presentation.persistence.PresentationRevision;

import tools.jackson.databind.PropertyNamingStrategies;
import tools.jackson.databind.annotation.JsonNaming;

import java.util.List;
import java.util.UUID;

public final class PresentationDtos {
    private PresentationDtos() {}

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record CreateInput(
            @NotBlank String templateId,
            @NotBlank @Size(max = 12000) String topic,
            String mode,
            String model) {}

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record PreviewInput(
            @NotBlank String templateId, @NotBlank @Size(max = 12000) String topic, String model) {}

    public record ChatInput(@NotBlank @Size(max = 4000) String message, String model) {}

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record View(
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
        static View from(Presentation p) {
            return new View(
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

    public record Page(List<View> items, long total, int limit, int offset) {}

    public record ChatReply(int version, String reply, View presentation) {}

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record Revision(
            int version,
            String message,
            String reply,
            int slideCount,
            String model,
            long createdAt) {
        static Revision from(PresentationRevision r) {
            return new Revision(
                    r.getVersion(),
                    r.getMessage(),
                    r.getReply(),
                    r.getSlideCount(),
                    r.getModel() == null ? "" : r.getModel(),
                    r.getCreatedAt().getEpochSecond());
        }
    }
}
