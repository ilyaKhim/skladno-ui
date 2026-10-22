package ru.godeck.presentation.dto;

import ru.godeck.presentation.entity.PresentationAiCall;

import tools.jackson.databind.PropertyNamingStrategies;
import tools.jackson.databind.annotation.JsonNaming;

import java.util.Locale;
import java.util.UUID;

@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public record PresentationAiCallView(
        UUID id,
        String operation,
        String model,
        String requestBody,
        String responseBody,
        Integer httpStatus,
        String errorCode,
        long startedAt,
        Long completedAt,
        Long durationMs) {
    public static PresentationAiCallView from(PresentationAiCall call) {
        return new PresentationAiCallView(
                call.getId(),
                call.getOperation().name().toLowerCase(Locale.ROOT),
                call.getModel(),
                call.getRequestBody(),
                call.getResponseBody(),
                call.getHttpStatus(),
                call.getErrorCode(),
                call.getStartedAt().toEpochMilli(),
                call.getCompletedAt() == null ? null : call.getCompletedAt().toEpochMilli(),
                call.getDurationMs());
    }
}
