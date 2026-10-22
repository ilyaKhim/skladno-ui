package ru.godeck.presentation.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import ru.godeck.presentation.policy.PresentationPolicy;

import tools.jackson.databind.PropertyNamingStrategies;
import tools.jackson.databind.annotation.JsonNaming;

@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public record PreviewPromptRequest(
        @NotBlank String templateId,
        @NotBlank @Size(max = PresentationPolicy.MAX_TOPIC_LENGTH) String topic,
        String model) {}
