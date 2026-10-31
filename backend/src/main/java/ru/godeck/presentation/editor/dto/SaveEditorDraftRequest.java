package ru.godeck.presentation.editor.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import jakarta.validation.Valid;
import ru.godeck.presentation.model.TextStyle;

import tools.jackson.databind.annotation.JsonNaming;
import tools.jackson.databind.PropertyNamingStrategies;

import java.util.List;

/**
 * Complete editor snapshot. Omitted text styles preserve an older client's document;
 * explicit empty styles reset formatting, which makes undo work even after autosave.
 */
@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public record SaveEditorDraftRequest(
        @Min(0) int baseVersion,
        @Min(0) long draftRevision,
        @NotBlank @Size(max = 240) String title,
        @NotEmpty List<@Valid Slide> slides) {
    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record Slide(
            @Min(1) int sourceSlideNumber,
            @NotBlank @Size(max = 120) String name,
            boolean hidden,
            @NotEmpty List<@Valid TextBlock> blocks,
            List<@Valid CustomTextBlock> customBlocks,
            List<@Valid ImageBlock> images,
            List<@Valid TextLayout> layouts) {
        public List<CustomTextBlock> customBlocksOrEmpty() {
            return customBlocks == null ? List.of() : customBlocks;
        }

        public List<ImageBlock> imagesOrEmpty() {
            return images == null ? List.of() : images;
        }

        public List<TextLayout> layoutsOrEmpty() {
            return layouts == null ? List.of() : layouts;
        }
    }

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record TextBlock(@NotBlank @Size(max = 120) String fieldKey, @NotNull String text) {}

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record CustomTextBlock(
            @NotBlank @Size(max = 120) String id,
            @NotNull @Size(max = 4000) String text,
            double x,
            double y,
            double width,
            double height,
            int fontSize,
            int weight,
            @NotBlank String align,
            @NotBlank String color,
            TextStyle textStyle) {
        public CustomTextBlock(String id, String text, double x, double y, double width, double height,
                int fontSize, int weight, String align, String color) {
            this(id, text, x, y, width, height, fontSize, weight, align, color, null);
        }
    }

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record ImageBlock(
            @NotBlank @Size(max = 120) String id,
            @NotBlank String assetId,
            @NotNull @Size(max = 500) String alt,
            double x,
            double y,
            double width,
            double height) {}

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record TextLayout(
            @NotBlank @Size(max = 120) String id,
            double x,
            double y,
            double width,
            double height,
            TextStyle textStyle) {
        public TextLayout(String id, double x, double y, double width, double height) {
            this(id, x, y, width, height, null);
        }
    }
}
