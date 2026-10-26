package ru.godeck.presentation.dto;

import tools.jackson.databind.PropertyNamingStrategies;
import tools.jackson.databind.annotation.JsonNaming;

import java.util.List;
import java.util.UUID;

@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public record EditorDeckView(
        UUID id,
        String title,
        int baseVersion,
        long draftRevision,
        SlideSize slideSize,
        List<Slide> slides) {
    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record SlideSize(int width, int height) {}

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record Slide(
            String id,
            int sourceSlideNumber,
            String name,
            String theme,
            boolean hidden,
            List<TextBlock> blocks,
            List<ImageBlock> images) {}

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record TextBlock(
            String id,
            String fieldKey,
            String layoutId,
            int maxChars,
            String role,
            String text,
            double x,
            double y,
            double width,
            double height,
            int fontSize,
            int weight,
            String align,
            String color) {}

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record ImageBlock(
            String id,
            String assetId,
            String url,
            String alt,
            double x,
            double y,
            double width,
            double height) {}
}
