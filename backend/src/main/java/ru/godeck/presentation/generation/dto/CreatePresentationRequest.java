package ru.godeck.presentation.generation.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import ru.godeck.presentation.material.MaterialPolicy;
import ru.godeck.presentation.material.SourceMaterial;
import ru.godeck.presentation.policy.PresentationPolicy;

import tools.jackson.databind.annotation.JsonNaming;
import tools.jackson.databind.PropertyNamingStrategies;

@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public record CreatePresentationRequest(
        @NotBlank String templateId,
        @NotBlank @Size(max = PresentationPolicy.MAX_TOPIC_LENGTH) String topic,
        String mode,
        String model,
        @Size(max = MaterialPolicy.MAX_CONTEXT_CHARACTERS) String goal,
        @Size(max = MaterialPolicy.MAX_CONTEXT_CHARACTERS) String audience,
        SourceMaterial source) {}
