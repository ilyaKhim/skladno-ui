package ru.godeck.presentation.aiedit.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import ru.godeck.presentation.aiedit.policy.AiEditPolicy;
import ru.godeck.presentation.policy.PresentationPolicy;

import tools.jackson.databind.PropertyNamingStrategies;
import tools.jackson.databind.annotation.JsonNaming;

import java.util.Map;
import java.util.UUID;

/**
 * Body of {@code POST /api/generation/v1/presentations/{id}/editor/ai/text-edits}.
 *
 * <p>Bean validation covers structure ({@code invalid_input}); the action, parameters, target and
 * text are checked by the service with their own error codes.
 *
 * @param requestId idempotency key: new for each message, reused only for a network retry
 * @param params string parameters of the action; {@code null} is the same as {@code {}}
 * @param text source: current block text or the text of the proposal being refined
 * @param variants 1…3; {@code null} means the default
 * @param model model id, or {@code null} for the configured text-edit model
 */
@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public record TextEditRequest(
        @NotNull UUID requestId,
        @NotBlank @Size(max = AiEditPolicy.ACTION_ID_MAX_LENGTH) String action,
        Map<String, String> params,
        @NotNull @Valid TextEditTargetDto target,
        @NotNull String text,
        UUID refinesEditId,
        @Min(1) @Max(AiEditPolicy.MAX_VARIANTS) Integer variants,
        @Pattern(regexp = PresentationPolicy.MODEL_ID_PATTERN) String model) {
    public Map<String, String> paramsOrEmpty() {
        return params == null ? Map.of() : params;
    }

    public int variantsOrDefault() {
        return variants == null ? AiEditPolicy.DEFAULT_VARIANTS : variants;
    }
}
