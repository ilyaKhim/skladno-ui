package ru.godeck.presentation.aiedit.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import ru.godeck.presentation.aiedit.policy.AiEditPolicy;

import tools.jackson.databind.PropertyNamingStrategies;
import tools.jackson.databind.annotation.JsonNaming;

/**
 * Block addressed by an edit: {@code template_field} with {@code field_key}, or {@code
 * custom_block} with {@code block_id}; the other key is {@code null}.
 */
@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public record TextEditTargetDto(
        @NotBlank @Size(max = AiEditPolicy.KIND_MAX_LENGTH) String kind,
        @NotBlank @Size(max = AiEditPolicy.SLIDE_ID_MAX_LENGTH) String slideId,
        @Size(max = AiEditPolicy.FIELD_KEY_MAX_LENGTH) String fieldKey,
        @Size(max = AiEditPolicy.BLOCK_ID_MAX_LENGTH) String blockId) {}
