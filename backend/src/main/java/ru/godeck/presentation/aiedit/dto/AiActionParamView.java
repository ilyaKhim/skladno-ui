package ru.godeck.presentation.aiedit.dto;

import tools.jackson.databind.PropertyNamingStrategies;
import tools.jackson.databind.annotation.JsonNaming;

import java.util.List;

/** Custom instruction metadata. Empty options are retained for API compatibility. */
@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public record AiActionParamView(
        String name,
        String type,
        boolean required,
        Integer maxLength,
        List<String> options) {}
