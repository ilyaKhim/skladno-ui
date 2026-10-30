package ru.godeck.presentation.template;

import org.springframework.stereotype.Component;

import ru.godeck.presentation.exception.GenerationError;
import ru.godeck.presentation.exception.GenerationException;
import ru.godeck.presentation.model.PresentationContent;

import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Validates and canonicalizes the semantic document shared by AI generation, the visual editor,
 * and PPTX rendering.
 *
 * <p>The validator intentionally has no Apache POI dependency. It is therefore cheap enough to run
 * at every trust boundary and gives every producer the same limits for text, geometry, identifiers,
 * and template fields before any file work begins.
 */
@Component
public class PresentationContentValidator {
    private static final String FIELDS_MISMATCH = "Fields do not match the template.";
    private static final String MISSING_FIELD = "Missing template field ";
    private static final String UNRESOLVED_MARKER = "Unresolved template marker.";
    private static final String TEXT_TOO_LONG = "Field text exceeds the editor hard limit.";
    private static final int MAX_TEXT_BLOCKS_PER_SLIDE = 100;
    private static final int MAX_TEXT_BLOCK_LENGTH = 4_000;
    private static final int MAX_IMAGE_BLOCKS_PER_SLIDE = 50;
    private static final int MAX_TEXT_LAYOUTS_PER_SLIDE = 100;
    private static final Pattern BLOCK_ID = Pattern.compile("[A-Za-z0-9][A-Za-z0-9_-]{0,119}");
    private static final Set<Integer> FONT_WEIGHTS = Set.of(400, 500, 700);
    private static final Set<String> TEXT_ALIGNS = Set.of("left", "center", "right");
    private static final Set<String> TEXT_COLORS = Set.of("ink", "muted", "brand");

    /**
     * Returns an immutable, canonical snapshot or a public {@code INVALID_CONTENT} error.
     *
     * <p>Every source slide must occur exactly once, while {@code include} decides whether it belongs
     * in the output and list order decides the output order. Block identifiers are unique across the
     * full deck because the frontend uses them as stable drag/edit keys.
     */
    public PresentationContent normalize(
            PresentationContent content, Map<String, Integer> fields, int slideCount) {
        return normalize(content, fields, slideCount, TextLengthMode.TRUNCATE);
    }

    /**
     * Same as {@link #normalize(PresentationContent, Map, int)}, with an explicit policy for field
     * text longer than {@code max_chars}. All other checks are identical in both modes.
     */
    public PresentationContent normalize(
            PresentationContent content,
            Map<String, Integer> fields,
            int slideCount,
            TextLengthMode mode) {
        try {
            if (content == null
                    || content.fields() == null
                    || content.slides() == null
                    || content.slides().size() != slideCount) throw new IllegalArgumentException();
            Map<String, String> values = normalizeValues(content.fields(), fields, mode);
            var seen = new HashSet<Integer>();
            for (var slide : content.slides()) {
                if (slide == null
                        || slide.slide() < 1
                        || slide.slide() > slideCount
                        || !seen.add(slide.slide())
                        || slide.include() == null
                        || slide.reason() == null
                        || slide.reason().isBlank()) throw new IllegalArgumentException();
            }
            if (content.slideCount() == 0) throw new IllegalArgumentException();
            var blockIds = new HashSet<String>();
            List<PresentationContent.Slide> slides =
                    content.slides().stream()
                            .map(
                                    slide ->
                                            new PresentationContent.Slide(
                                                    slide.slide(),
                                                    slide.include(),
                                                    slide.reason(),
                                                    slide.hiddenOrFalse(),
                                                    normalizeTextBlocks(
                                                            slide.textBlocksOrEmpty(), blockIds),
                                                    normalizeImageBlocks(
                                                            slide.imageBlocksOrEmpty(), blockIds),
                                                    normalizeTextLayouts(
                                                            slide.textLayoutsOrEmpty())))
                            .toList();
            return new PresentationContent(
                    Collections.unmodifiableMap(values), List.copyOf(slides));
        } catch (IllegalArgumentException | NullPointerException invalid) {
            throw new GenerationException(GenerationError.INVALID_CONTENT);
        }
    }

    /** Validates user-created text blocks and enforces deck-wide identifier uniqueness. */
    private static List<PresentationContent.TextBlock> normalizeTextBlocks(
            List<PresentationContent.TextBlock> blocks, Set<String> ids) {
        if (blocks.size() > MAX_TEXT_BLOCKS_PER_SLIDE) throw new IllegalArgumentException();
        return blocks.stream()
                .map(
                        block -> {
                            if (block == null
                                    || block.id() == null
                                    || !BLOCK_ID.matcher(block.id()).matches()
                                    || !ids.add(block.id())
                                    || block.text() == null
                                    || block.text().length() > MAX_TEXT_BLOCK_LENGTH
                                    || !finite(block.x(), block.y(), block.width(), block.height())
                                    || block.x() < 0
                                    || block.y() < 0
                                    || block.width() < 3
                                    || block.height() < 3
                                    || block.x() + block.width() > 100.001
                                    || block.y() + block.height() > 100.001
                                    || block.fontSize() < 8
                                    || block.fontSize() > 96
                                    || !FONT_WEIGHTS.contains(block.weight())
                                    || !TEXT_ALIGNS.contains(block.align())
                                    || !TEXT_COLORS.contains(block.color()))
                                throw new IllegalArgumentException();
                            return block;
                        })
                .toList();
    }

    private static boolean finite(double... values) {
        for (double value : values) if (!Double.isFinite(value)) return false;
        return true;
    }

    /** Validates image references and geometry without reading the underlying asset. */
    private static List<PresentationContent.ImageBlock> normalizeImageBlocks(
            List<PresentationContent.ImageBlock> blocks, Set<String> ids) {
        if (blocks.size() > MAX_IMAGE_BLOCKS_PER_SLIDE) throw new IllegalArgumentException();
        return blocks.stream()
                .map(
                        block -> {
                            if (block == null
                                    || block.id() == null
                                    || !BLOCK_ID.matcher(block.id()).matches()
                                    || !ids.add(block.id())
                                    || block.assetId() == null
                                    || !isUuid(block.assetId())
                                    || block.alt() == null
                                    || block.alt().length() > 500
                                    || !validGeometry(
                                            block.x(), block.y(), block.width(), block.height()))
                                throw new IllegalArgumentException();
                            return block;
                        })
                .toList();
    }

    private static boolean validGeometry(double x, double y, double width, double height) {
        return finite(x, y, width, height)
                && x >= 0
                && y >= 0
                && width >= 3
                && height >= 3
                && x + width <= 100.001
                && y + height <= 100.001;
    }

    /**
     * Validates moves of template-owned text shapes. Layout ids only need to be unique per slide
     * because their source-slide number is embedded in the id.
     */
    private static List<PresentationContent.TextLayout> normalizeTextLayouts(
            List<PresentationContent.TextLayout> layouts) {
        if (layouts.size() > MAX_TEXT_LAYOUTS_PER_SLIDE) throw new IllegalArgumentException();
        var ids = new HashSet<String>();
        return layouts.stream()
                .map(
                        layout -> {
                            if (layout == null
                                    || layout.id() == null
                                    || !BLOCK_ID.matcher(layout.id()).matches()
                                    || !ids.add(layout.id())
                                    || !validGeometry(
                                            layout.x(),
                                            layout.y(),
                                            layout.width(),
                                            layout.height()))
                                throw new IllegalArgumentException();
                            return layout;
                        })
                .toList();
    }

    private static boolean isUuid(String value) {
        try {
            java.util.UUID.fromString(value);
            return true;
        } catch (IllegalArgumentException invalid) {
            return false;
        }
    }

    /**
     * Requires exactly the fields discovered from the template and applies per-shape text limits.
     * Rejecting marker-like text prevents a second accidental substitution pass during rendering.
     */
    public Map<String, String> normalizeValues(
            Map<String, String> values, Map<String, Integer> fields) {
        return normalizeValues(values, fields, TextLengthMode.TRUNCATE);
    }

    /**
     * Validates field values with an explicit length policy: {@code TRUNCATE} shortens text to
     * {@code max_chars}; {@code ALLOW_OVERFLOW} keeps it intact and rejects text longer than {@link
     * EditorTextLimits#hard(int)}.
     */
    public Map<String, String> normalizeValues(
            Map<String, String> values, Map<String, Integer> fields, TextLengthMode mode) {
        if (!values.keySet().equals(fields.keySet()))
            throw new IllegalArgumentException(FIELDS_MISMATCH);
        Map<String, String> normalized = new LinkedHashMap<>();
        for (var field : fields.entrySet()) {
            String value = values.get(field.getKey());
            if (value == null) throw new IllegalArgumentException(MISSING_FIELD + field.getKey());
            if (value.contains("{{") || value.contains("}}"))
                throw new IllegalArgumentException(UNRESOLVED_MARKER);
            normalized.put(field.getKey(), applyLength(value, field.getValue(), mode));
        }
        return normalized;
    }

    private static String applyLength(String value, int max, TextLengthMode mode) {
        if (mode == TextLengthMode.TRUNCATE) return limit(value, max);
        if (value.length() > EditorTextLimits.hard(max))
            throw new IllegalArgumentException(TEXT_TOO_LONG);
        return value;
    }

    /**
     * Shortens overlong text at a useful word boundary and keeps UTF-16 surrogate pairs intact.
     * Truncation, instead of rejection, makes AI output resilient while still protecting layouts.
     */
    private static String limit(String value, int max) {
        if (value.length() <= max) return value;
        if (max <= TemplateTextPolicy.MIN_LENGTH_FOR_ELLIPSIS)
            return value.substring(0, safeEnd(value, max));
        int end = safeEnd(value, max - 1);
        String cut = value.substring(0, end);
        int space = cut.lastIndexOf(' ');
        if (space >= (int) (max * TemplateTextPolicy.WORD_BOUNDARY_MINIMUM_FRACTION))
            cut = cut.substring(0, space);
        return cut.replaceAll("[ ,.;:—-]+$", "") + "…";
    }

    private static int safeEnd(String value, int end) {
        return end > 0
                        && end < value.length()
                        && Character.isHighSurrogate(value.charAt(end - 1))
                        && Character.isLowSurrogate(value.charAt(end))
                ? end - 1
                : end;
    }
}
