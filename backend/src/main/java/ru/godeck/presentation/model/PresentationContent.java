package ru.godeck.presentation.model;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.util.List;
import java.util.Map;

public record PresentationContent(
        @NotNull Map<String, String> fields, @NotEmpty List<@Valid Slide> slides) {
    public record Slide(
            @Min(1) int slide,
            @NotNull Boolean include,
            @NotBlank String reason,
            Boolean hidden,
            List<TextBlock> textBlocks,
            List<ImageBlock> imageBlocks,
            List<TextLayout> textLayouts) {
        public Slide(int slide, Boolean include, String reason) {
            this(slide, include, reason, false, List.of(), List.of(), List.of());
        }

        public Slide(int slide, Boolean include, String reason, Boolean hidden) {
            this(slide, include, reason, hidden, List.of(), List.of(), List.of());
        }

        public Slide(
                int slide,
                Boolean include,
                String reason,
                Boolean hidden,
                List<TextBlock> textBlocks) {
            this(slide, include, reason, hidden, textBlocks, List.of(), List.of());
        }

        public Slide(
                int slide,
                Boolean include,
                String reason,
                Boolean hidden,
                List<TextBlock> textBlocks,
                List<ImageBlock> imageBlocks) {
            this(slide, include, reason, hidden, textBlocks, imageBlocks, List.of());
        }

        public boolean hiddenOrFalse() {
            return Boolean.TRUE.equals(hidden);
        }

        public List<TextBlock> textBlocksOrEmpty() {
            return textBlocks == null ? List.of() : textBlocks;
        }

        public List<ImageBlock> imageBlocksOrEmpty() {
            return imageBlocks == null ? List.of() : imageBlocks;
        }

        public List<TextLayout> textLayoutsOrEmpty() {
            return textLayouts == null ? List.of() : textLayouts;
        }
    }

    /** A freeform text box created in the visual editor. Geometry is a percentage of the slide. */
    public record TextBlock(
            String id,
            String text,
            double x,
            double y,
            double width,
            double height,
            int fontSize,
            int weight,
            String align,
            String color) {}

    /** An uploaded image placed by the visual editor. Geometry is a percentage of the slide. */
    public record ImageBlock(
            String id,
            String assetId,
            String alt,
            double x,
            double y,
            double width,
            double height) {}

    /** Geometry override for a text shape originating in the PowerPoint template. */
    public record TextLayout(
            String id, double x, double y, double width, double height) {}

    public int slideCount() {
        return (int) slides.stream().filter(s -> Boolean.TRUE.equals(s.include())).count();
    }
}
