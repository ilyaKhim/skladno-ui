package ru.godeck.presentation.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import ru.godeck.presentation.material.MaterialPolicy;
import ru.godeck.presentation.model.SourceMaterial;
import ru.godeck.presentation.policy.PresentationPolicy;

import tools.jackson.databind.PropertyNamingStrategies;
import tools.jackson.databind.annotation.JsonNaming;

@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public record PreviewPromptRequest(
        @NotBlank String templateId,
        @NotBlank @Size(max = PresentationPolicy.MAX_TOPIC_LENGTH) String topic,
        String model,
        @Size(max = MaterialPolicy.MAX_CONTEXT_CHARACTERS) String goal,
        @Size(max = MaterialPolicy.MAX_CONTEXT_CHARACTERS) String audience,
        SourceMaterial source) {}
