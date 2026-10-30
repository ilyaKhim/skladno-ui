package ru.godeck.presentation.aiedit.dto;

import ru.godeck.presentation.aiedit.action.ActionParam;

import tools.jackson.databind.PropertyNamingStrategies;
import tools.jackson.databind.annotation.JsonNaming;

import java.util.List;

/** Action parameter: {@code max_length} for strings, {@code options} for enums. */
@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public record AiActionParamView(
        String name,
        ActionParam.Type type,
        boolean required,
        Integer maxLength,
        List<AiActionOptionView> options) {}
