package ru.godeck.presentation.aiedit.dto;

import tools.jackson.databind.PropertyNamingStrategies;
import tools.jackson.databind.annotation.JsonNaming;

@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public record AiEditLimitsView(int customBlockMaxInputChars) {}
