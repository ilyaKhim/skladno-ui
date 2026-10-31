package ru.godeck.presentation.editor.dto;

import tools.jackson.databind.annotation.JsonNaming;
import tools.jackson.databind.PropertyNamingStrategies;

@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public record EditorAssetView(
        String id, String url, String name, int width, int height) {}
