package ru.godeck.presentation.model;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.util.List;
import java.util.Map;

/**
 * Canonical semantic representation of a generated presentation.
 *
 * <p>This model is the contract shared by AI generation, manual input, the visual editor, stored
 * revisions, validation, and PPTX rendering. It deliberately stores intent rather than Apache POI
 * objects so content remains serializable, testable, and independent of a particular output file.
 *
 * @param fields template placeholder values keyed by field name
 * @param slides decisions and editor additions in the desired presentation order
 */
public record PresentationContent(
        @NotNull Map<String, String> fields, @NotEmpty List<@Valid Slide> slides) {
    /**
     * Describes one source-template slide in the semantic plan.
     *
     * <p>{@code include=false} removes the slide from the output; {@code include=true} with
     * {@code hidden=true} keeps it in the PPTX but excludes it from the normal slide show. The list
     * order is significant and becomes the output slide order.
     *
     * @param slide one-based slide number in the immutable source template
     * @param include whether the slide belongs to the output document
     * @param reason generation or user rationale retained for traceability
     * @param hidden PowerPoint hidden flag for an included slide
     * @param textBlocks freeform text boxes created by the editor
     * @param imageBlocks presentation-scoped images created by the editor
     * @param textLayouts geometry overrides for text shapes originating in the template
     */
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

        /** Returns a null-safe hidden value for content created before the editor schema existed. */
        public boolean hiddenOrFalse() {
            return Boolean.TRUE.equals(hidden);
        }

        /** Returns editor text boxes while treating old JSON without the property as empty. */
        public List<TextBlock> textBlocksOrEmpty() {
            return textBlocks == null ? List.of() : textBlocks;
        }

        /** Returns editor images while preserving backwards compatibility with old revisions. */
        public List<ImageBlock> imageBlocksOrEmpty() {
            return imageBlocks == null ? List.of() : imageBlocks;
        }

        /** Returns template-shape overrides while preserving backwards compatibility. */
        public List<TextLayout> textLayoutsOrEmpty() {
            return textLayouts == null ? List.of() : textLayouts;
        }
    }

    /**
     * A freeform text box created in the visual editor.
     *
     * <p>Geometry is stored as a percentage of the slide so browser rendering and PowerPoint
     * rendering can use different physical dimensions without changing the document model.
     *
     * @param id deck-wide stable editor identifier
     * @param text displayed text
     * @param x left edge as a percentage of slide width
     * @param y top edge as a percentage of slide height
     * @param width width as a percentage of slide width
     * @param height height as a percentage of slide height
     * @param fontSize browser CSS font size in pixels; converted to PowerPoint points on export
     * @param weight supported CSS-like font weight
     * @param align normalized horizontal alignment
     * @param color semantic template color token
     */
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

    /**
     * An uploaded image placed by the visual editor.
     *
     * <p>The model contains only an opaque presentation-scoped asset id. Image bytes and private
     * filesystem paths remain in the storage module.
     *
     * @param id deck-wide stable editor identifier
     * @param assetId opaque UUID resolved only inside the owning presentation
     * @param alt accessible/editor label retained with the block
     * @param x left edge as a percentage of slide width
     * @param y top edge as a percentage of slide height
     * @param width width as a percentage of slide width
     * @param height height as a percentage of slide height
     */
    public record ImageBlock(
            String id,
            String assetId,
            String alt,
            double x,
            double y,
            double width,
            double height) {}

    /**
     * Geometry override for a text shape originating in the PowerPoint template.
     *
     * <p>The stable id ties an editor action back to the shape discovered in the source template;
     * all values are percentages of the slide dimensions.
     *
     * @param id deterministic source-slide layout identifier
     * @param x left edge as a percentage of slide width
     * @param y top edge as a percentage of slide height
     * @param width width as a percentage of slide width
     * @param height height as a percentage of slide height
     */
    public record TextLayout(
            String id, double x, double y, double width, double height) {}

    /**
     * Counts slides physically present in the PPTX, including hidden slides.
     *
     * @return number of decisions with {@code include=true}
     */
    public int slideCount() {
        return (int) slides.stream().filter(s -> Boolean.TRUE.equals(s.include())).count();
    }
}
