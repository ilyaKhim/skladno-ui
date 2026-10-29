package ru.godeck.presentation.aiedit.dto;

import tools.jackson.databind.PropertyNamingStrategies;
import tools.jackson.databind.annotation.JsonNaming;

import java.util.List;

/** Response of {@code GET /api/generation/v1/editor/ai/actions}. */
@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public record AiActionCatalogView(
        List<AiActionView> actions,
        AiVariantsView variants,
        AiEditLimitsView limits,
        boolean enabled) {}
