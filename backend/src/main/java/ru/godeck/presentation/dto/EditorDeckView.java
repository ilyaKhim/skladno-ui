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
            String backgroundUrl,
            boolean hidden,
            List<TextBlock> blocks,
            List<ImageBlock> images) {}

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record TextBlock(
            String id,
            String fieldKey,
            String layoutId,
            int maxChars,
            int hardMaxChars,
            String role,
            String text,
            double x,
            double y,
            double width,
            double height,
            int fontSize,
            int weight,
            String align,
            String color,
            String fontColor,
            ParagraphStyle paragraph) {}

    /**
     * Browser-safe subset of the PowerPoint paragraph model.
     *
     * <p>PowerPoint can place several semantic fields in separate paragraphs of one text shape.
     * The shape owns geometry, while this record preserves the paragraph order, bullet and vertical
     * rhythm needed to render those fields inside one browser container. Spacing and margins are
     * expressed as CSS pixels at the editor's canonical 960 px slide width.
     */
    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record ParagraphStyle(
            int index,
            String bullet,
            String bulletColor,
            Double lineHeight,
            double spaceBefore,
            double spaceAfter,
            double leftMargin,
            double indent) {}

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
