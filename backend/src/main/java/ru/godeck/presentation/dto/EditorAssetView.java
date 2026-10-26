package ru.godeck.presentation.dto;

import tools.jackson.databind.PropertyNamingStrategies;
import tools.jackson.databind.annotation.JsonNaming;

@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public record EditorAssetView(
        String id, String url, String name, int width, int height) {}
