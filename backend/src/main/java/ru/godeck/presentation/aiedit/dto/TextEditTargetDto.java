package ru.godeck.presentation.aiedit.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import ru.godeck.presentation.aiedit.policy.AiEditPolicy;

import tools.jackson.databind.PropertyNamingStrategies;
import tools.jackson.databind.annotation.JsonNaming;

/**
 * Block addressed by an edit: {@code template_field} with {@code field_key}, or {@code
 * custom_block} with {@code block_id}; the other key is {@code null}.
 *
 * <p>Slide, field and block values are not limited here: one that does not exist in the document,
 * however long, is {@code invalid_target} from the service.
 */
@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public record TextEditTargetDto(
        @NotBlank @Size(max = AiEditPolicy.KIND_MAX_LENGTH) String kind,
        @NotNull String slideId,
        String fieldKey,
        String blockId) {}
