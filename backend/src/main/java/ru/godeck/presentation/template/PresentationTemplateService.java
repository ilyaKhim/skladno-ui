package ru.godeck.presentation.template;

import org.apache.poi.xslf.usermodel.XMLSlideShow;
import org.apache.poi.xslf.usermodel.XSLFGroupShape;
import org.apache.poi.xslf.usermodel.XSLFShape;
import org.apache.poi.xslf.usermodel.XSLFSlide;
import org.apache.poi.xslf.usermodel.XSLFTextParagraph;
import org.apache.poi.xslf.usermodel.XSLFTextRun;
import org.apache.poi.xslf.usermodel.XSLFTextShape;
import org.apache.poi.sl.usermodel.PictureData;
import org.apache.poi.sl.usermodel.TextParagraph.TextAlign;
import org.apache.poi.sl.usermodel.VerticalAlignment;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import ru.godeck.common.text.BackendMessages;
import ru.godeck.presentation.dto.EditorDeckView;
import ru.godeck.presentation.exception.GenerationError;
import ru.godeck.presentation.exception.GenerationException;
import ru.godeck.presentation.model.PresentationContent;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.awt.Color;
import java.awt.geom.Rectangle2D;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.function.Function;

/**
 * Owns the contract between semantic presentation content and the physical PPTX templates.
 *
 * <p>At startup the service loads every bundled template, verifies its sidecar metadata, discovers
 * {@code {{FIELD}}} markers, and builds an immutable registry. During a request it can expose that
 * registry to the AI/editor or render a validated {@link PresentationContent} into a new PPTX.
 * Keeping template inspection and rendering together is intentional: field limits, source slide
 * numbers, editor layout identifiers, and the final Apache POI mutations must all describe the same
 * template revision.
 */
@Service
public class PresentationTemplateService {
    private static final String TEMPLATE_MARKERS_MISSING = "The template has no {{FIELD}} markers.";
    private static final String UNKNOWN_FIELD_PREFIX = "Unknown template field ";

    public static final String TEMPLATE_ID = "aurora";
    private static final Pattern TOKEN = Pattern.compile("\\{\\{([A-Za-z_][A-Za-z0-9_]*)}}");
    private static final List<String> TEMPLATE_IDS =
            List.of(TEMPLATE_ID, "atlas", "monolith", "nord", "opal");
    private static final String TEMPLATE_DESCRIPTION_INVALID =
            "Invalid presentation template description: ";
    private static final String TEMPLATE_BRIEF =
            "Описание шаблона (JSON):\n%s\n\nЗадача пользователя: %s";
    private final Map<String, Template> templates;
    private final PresentationContentValidator validator;

    public PresentationTemplateService(ObjectMapper json, PresentationContentValidator validator)
            throws Exception {
        this.validator = validator;
        Map<String, Template> loaded = new LinkedHashMap<>();
        for (String id : TEMPLATE_IDS) {
            byte[] source;
            try (InputStream input =
                    new ClassPathResource("templates/" + id + ".pptx").getInputStream()) {
                source = input.readAllBytes();
            }
            JsonNode description = json.createObjectNode();
            var sidecar = new ClassPathResource("templates/" + id + ".json");
            if (sidecar.exists()) {
                try (InputStream input = sidecar.getInputStream()) {
                    description = json.readTree(input);
                }
                if (!description.isObject())
                    throw new IllegalStateException(TEMPLATE_DESCRIPTION_INVALID + id);
            }
            try (var show = new XMLSlideShow(new ByteArrayInputStream(source))) {
                Map<String, Integer> fields = inspect(show);
                if (fields.isEmpty()) throw new IllegalStateException(TEMPLATE_MARKERS_MISSING);
                if (description.has("slides")
                        && description.path("slides").asInt() != show.getSlides().size())
                    throw new IllegalStateException(TEMPLATE_DESCRIPTION_INVALID + id);
                for (String field : fields.keySet()) {
                    var hint = description.path("field_hints").path(field).path("max_chars");
                    if (!hint.isMissingNode()) {
                        if (!hint.isIntegralNumber() || hint.asInt() <= 0)
                            throw new IllegalStateException(TEMPLATE_DESCRIPTION_INVALID + field);
                        fields.put(field, hint.asInt());
                    }
                }
                loaded.put(
                        id,
                        new Template(
                                source,
                                java.util.Collections.unmodifiableMap(fields),
                                show.getSlides().size(),
                                description,
                                readManifest(show),
                                readTextLayoutIds(show)));
            }
        }
        templates = java.util.Collections.unmodifiableMap(loaded);
    }

    /** Returns public metadata for every selectable template in stable UI order. */
    public List<Map<String, Object>> catalogs() {
        return TEMPLATE_IDS.stream().map(this::catalog).toList();
    }

    /**
     * Resolves an internal template definition and converts unknown identifiers into a stable API
     * error instead of leaking a map lookup failure.
     */
    private Template get(String id) {
        Template template = id == null ? null : templates.get(id);
        if (template == null) throw new GenerationException(GenerationError.TEMPLATE_NOT_FOUND);
        return template;
    }

    /** Returns a defensive copy of the JSON description used in prompts and template discovery. */
    public JsonNode description(String id) {
        return get(id).description().deepCopy();
    }

    /**
     * Adds template-specific design guidance to the user's topic before it is sent to the model.
     * This gives generation enough context to choose slides and write copy that fits the template.
     */
    public String withDescription(String id, String topic) {
        JsonNode description = get(id).description();
        return description.isEmpty() ? topic : TEMPLATE_BRIEF.formatted(description, topic);
    }

    private record Template(
            byte[] source,
            Map<String, Integer> fields,
            int slideCount,
            JsonNode description,
            List<Map<String, Object>> slideManifest,
            Map<Integer, List<String>> textLayoutIds) {}

    /** Returns the default template catalog entry retained for backward-compatible clients. */
    public Map<String, Object> catalog() {
        return catalog(TEMPLATE_ID);
    }

    private Map<String, Object> catalog(String id) {
        Template template = get(id);
        return Map.of(
                "id",
                id,
                "number",
                TEMPLATE_IDS.indexOf(id) + 1,
                "name",
                template.description()
                        .path("name")
                        .asText(BackendMessages.text("presentation.template.aurora.name")),
                "description",
                template.description()
                        .path("description")
                        .asText(
                                BackendMessages.text(
                                        "presentation.template.aurora.description",
                                        template.slideCount())),
                "available_slides",
                template.slideCount(),
                "preview_url",
                "",
                "selection",
                "manual");
    }

    /** Returns discovered field names and maximum character counts for the default template. */
    public Map<String, Integer> fields() {
        return fields(TEMPLATE_ID);
    }

    /**
     * Returns the immutable field contract for a template. The same contract drives JSON Schema,
     * manual content validation, editor values, and marker replacement.
     */
    public Map<String, Integer> fields(String id) {
        return get(id).fields();
    }

    /** Returns a defensive copy of the default binary template. */
    public byte[] source() {
        return get(TEMPLATE_ID).source().clone();
    }

    /** Returns the source-slide/field manifest for the default template. */
    public List<Map<String, Object>> slideManifest() {
        return slideManifest(TEMPLATE_ID);
    }

    /**
     * Returns the source-slide manifest supplied to AI generation so slide decisions use real slide
     * numbers and only fields that occur on each slide.
     */
    public List<Map<String, Object>> slideManifest(String id) {
        return get(id).slideManifest();
    }

    /**
     * Returns stable identifiers for editable marker shapes on one source slide. These identifiers
     * let an editor draft move template-owned shapes without storing Apache POI object identities.
     */
    public List<String> textLayoutIds(String id, int slideNumber) {
        return get(id).textLayoutIds().getOrDefault(slideNumber, List.of());
    }

    private static List<Map<String, Object>> readManifest(XMLSlideShow show) {
        List<Map<String, Object>> slides = new ArrayList<>();
        int number = 0;
        for (XSLFSlide slide : show.getSlides()) {
            List<String> names = new ArrayList<>();
            for (XSLFShape shape : allShapes(slide.getShapes())) {
                if (shape instanceof XSLFTextShape text) {
                    Matcher matcher = TOKEN.matcher(text.getText());
                    while (matcher.find()) {
                        String name = matcher.group(1);
                        if (!names.contains(name)) names.add(name);
                    }
                }
            }
            slides.add(Map.of("slide", ++number, "fields", List.copyOf(names)));
        }
        return List.copyOf(slides);
    }

    private static Map<Integer, List<String>> readTextLayoutIds(XMLSlideShow show) {
        Map<Integer, List<String>> result = new LinkedHashMap<>();
        int slideNumber = 0;
        for (XSLFSlide slide : show.getSlides()) {
            slideNumber++;
            List<String> ids = new ArrayList<>();
            int layoutIndex = 0;
            for (XSLFShape shape : allShapes(slide.getShapes())) {
                if (shape instanceof XSLFTextShape textShape
                        && TOKEN.matcher(textShape.getText()).find())
                    ids.add(textLayoutId(slideNumber, ++layoutIndex));
            }
            result.put(slideNumber, List.copyOf(ids));
        }
        return java.util.Collections.unmodifiableMap(result);
    }

    /** Validates and truncates values against the default template field contract. */
    public Map<String, String> normalizeValues(Map<String, String> values) {
        return validator.normalizeValues(values, fields());
    }

    /** Validates semantic content against the default template. */
    public PresentationContent normalize(PresentationContent content) {
        return normalize(TEMPLATE_ID, content);
    }

    /**
     * Produces the canonical content snapshot for a template.
     *
     * <p>All entry points call this before rendering or exposing editor state so malformed geometry,
     * duplicate block identifiers, invalid slide decisions, and overlong text cannot reach POI.
     */
    public PresentationContent normalize(String id, PresentationContent content) {
        Template template = get(id);
        return validator.normalize(content, template.fields(), template.slideCount());
    }

    /** Renders content with the default template and no external image assets. */
    public byte[] render(PresentationContent content) throws Exception {
        return render(TEMPLATE_ID, content);
    }

    /** Renders content with the selected template and rejects unresolved image assets. */
    public byte[] render(String id, PresentationContent content) throws Exception {
        return render(
                id,
                content,
                assetId -> {
                    throw new GenerationException(GenerationError.IMAGE_NOT_FOUND);
                });
    }

    /**
     * Materializes semantic content as a PPTX byte array.
     *
     * <p>The renderer removes excluded source slides, applies the semantic list order, preserves the
     * hidden flag, moves template-owned text shapes, replaces markers, and finally adds user-created
     * text/image shapes. Images are resolved by opaque asset id so the template layer never needs to
     * know where tenant files are stored.
     */
    public byte[] render(
            String id, PresentationContent content, Function<String, byte[]> imageResolver)
            throws Exception {
        PresentationContent plan = normalize(id, content);
        Map<String, String> normalized = plan.fields();
        try (XMLSlideShow show = open(id)) {
            Map<Integer, XSLFSlide> bySourceNumber = new LinkedHashMap<>();
            for (int i = 0; i < show.getSlides().size(); i++)
                bySourceNumber.put(i + 1, show.getSlides().get(i));
            var included =
                    plan.slides().stream()
                            .filter(s -> Boolean.TRUE.equals(s.include()))
                            .map(PresentationContent.Slide::slide)
                            .collect(java.util.stream.Collectors.toSet());
            for (int i = show.getSlides().size() - 1; i >= 0; i--)
                if (!included.contains(i + 1)) show.removeSlide(i);
            int order = 0;
            for (var decision : plan.slides()) {
                if (!Boolean.TRUE.equals(decision.include())) continue;
                XSLFSlide slide = bySourceNumber.get(decision.slide());
                show.setSlideOrder(slide, order++);
                slide.setHidden(decision.hiddenOrFalse());
            }
            for (var decision : plan.slides()) {
                if (!Boolean.TRUE.equals(decision.include())) continue;
                XSLFSlide slide = bySourceNumber.get(decision.slide());
                applyTextLayouts(
                        slide,
                        decision.slide(),
                        decision.textLayoutsOrEmpty(),
                        show.getPageSize().getWidth(),
                        show.getPageSize().getHeight());
                for (XSLFShape shape : allShapes(slide.getShapes())) {
                    if (shape instanceof XSLFTextShape textShape) {
                        for (XSLFTextParagraph paragraph : textShape.getTextParagraphs()) {
                            replaceParagraph(paragraph, normalized);
                        }
                    }
                }
            }
            var page = show.getPageSize();
            for (var decision : plan.slides()) {
                if (!Boolean.TRUE.equals(decision.include())) continue;
                XSLFSlide slide = bySourceNumber.get(decision.slide());
                for (var block : decision.textBlocksOrEmpty()) {
                    addTextBlock(slide, block, page.getWidth(), page.getHeight(), id);
                }
                for (var image : decision.imageBlocksOrEmpty()) {
                    addImageBlock(
                            show,
                            slide,
                            image,
                            page.getWidth(),
                            page.getHeight(),
                            imageResolver);
                }
            }
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            show.write(output);
            return output.toByteArray();
        }
    }

    /**
     * Builds the browser editor projection from the same template and semantic snapshot used for
     * export.
     *
     * <p>Template marker shapes become editable text blocks with percentage geometry; user-created
     * blocks are appended unchanged. Using one projection method prevents the canvas and exported
     * PPTX from developing different coordinate systems or shape identities.
     */
    public EditorDeckView editorDeck(
            String templateId,
            java.util.UUID presentationId,
            String title,
            int baseVersion,
            long draftRevision,
            Map<Integer, String> slideNames,
            PresentationContent content)
            throws Exception {
        PresentationContent plan = normalize(templateId, content);
        try (XMLSlideShow show = open(templateId)) {
            var page = show.getPageSize();
            List<EditorDeckView.Slide> slides = new ArrayList<>();
            for (var decision : plan.slides()) {
                if (!Boolean.TRUE.equals(decision.include())) continue;
                int source = decision.slide();
                XSLFSlide slide = show.getSlides().get(source - 1);
                List<EditorDeckView.TextBlock> blocks = new ArrayList<>();
                Map<String, Integer> occurrences = new LinkedHashMap<>();
                Map<String, PresentationContent.TextLayout> layoutOverrides =
                        decision.textLayoutsOrEmpty().stream()
                                .collect(
                                        java.util.stream.Collectors.toMap(
                                                PresentationContent.TextLayout::id,
                                                Function.identity()));
                int layoutIndex = 0;
                for (XSLFShape shape : allShapes(slide.getShapes())) {
                    if (!(shape instanceof XSLFTextShape textShape)) continue;
                    Matcher matcher = TOKEN.matcher(textShape.getText());
                    if (!matcher.find()) continue;
                    String layoutId = textLayoutId(source, ++layoutIndex);
                    PresentationContent.TextLayout override = layoutOverrides.get(layoutId);
                    Rectangle2D anchor = textShape.getAnchor();
                    double x =
                            override != null
                                    ? override.x()
                                    : anchor == null ? 8 : percent(anchor.getX(), page.getWidth());
                    double y =
                            override != null
                                    ? override.y()
                                    : anchor == null
                                            ? 8 + blocks.size() * 8
                                            : percent(anchor.getY(), page.getHeight());
                    double width =
                            override != null
                                    ? override.width()
                                    : anchor == null
                                            ? 84
                                            : percent(anchor.getWidth(), page.getWidth());
                    double height =
                            override != null
                                    ? override.height()
                                    : anchor == null
                                            ? 7
                                            : percent(anchor.getHeight(), page.getHeight());
                    do {
                        String field = matcher.group(1);
                        int occurrence = occurrences.merge(field, 1, Integer::sum);
                        XSLFTextRun run = firstRun(textShape);
                        XSLFTextParagraph paragraph =
                                textShape.getTextParagraphs().isEmpty()
                                        ? null
                                        : textShape.getTextParagraphs().getFirst();
                        String role = role(field);
                        blocks.add(
                                new EditorDeckView.TextBlock(
                                        "slide-" + source + "-field-" + field + "-" + occurrence,
                                        field,
                                        layoutId,
                                        get(templateId).fields().get(field),
                                        role,
                                        plan.fields().get(field),
                                        x,
                                        y,
                                        width,
                                        height,
                                        fontSize(run),
                                        run != null && run.isBold() ? 700 : 400,
                                        alignment(paragraph),
                                        color(role)));
                    } while (matcher.find());
                }
                for (var block : decision.textBlocksOrEmpty()) {
                    blocks.add(
                            new EditorDeckView.TextBlock(
                                    block.id(),
                                    null,
                                    null,
                                    4_000,
                                    "body",
                                    block.text(),
                                    block.x(),
                                    block.y(),
                                    block.width(),
                                    block.height(),
                                    block.fontSize(),
                                    block.weight(),
                                    block.align(),
                                    block.color()));
                }
                List<EditorDeckView.ImageBlock> images =
                        decision.imageBlocksOrEmpty().stream()
                                .map(
                                        image ->
                                                new EditorDeckView.ImageBlock(
                                                        image.id(),
                                                        image.assetId(),
                                                        "/api/generation/v1/presentations/"
                                                                + presentationId
                                                                + "/editor/assets/"
                                                                + image.assetId(),
                                                        image.alt(),
                                                        image.x(),
                                                        image.y(),
                                                        image.width(),
                                                        image.height()))
                                .toList();
                slides.add(
                        new EditorDeckView.Slide(
                                "slide-" + source,
                                source,
                                slideNames.getOrDefault(source, "Слайд " + source),
                                "monolith".equals(templateId) ? "navy" : "paper",
                                decision.hiddenOrFalse(),
                                List.copyOf(blocks),
                                images));
            }
            return new EditorDeckView(
                    presentationId,
                    title,
                    baseVersion,
                    draftRevision,
                    new EditorDeckView.SlideSize(960, 540),
                    List.copyOf(slides));
        }
    }

    private XMLSlideShow open(String id) throws Exception {
        return new XMLSlideShow(new ByteArrayInputStream(get(id).source()));
    }

    /** Applies percentage-based overrides to template-owned marker shapes before text replacement. */
    private static void applyTextLayouts(
            XSLFSlide slide,
            int slideNumber,
            List<PresentationContent.TextLayout> layouts,
            double pageWidth,
            double pageHeight) {
        if (layouts.isEmpty()) return;
        Map<String, PresentationContent.TextLayout> byId =
                layouts.stream()
                        .collect(
                                java.util.stream.Collectors.toMap(
                                        PresentationContent.TextLayout::id, Function.identity()));
        int layoutIndex = 0;
        for (XSLFShape shape : allShapes(slide.getShapes())) {
            if (!(shape instanceof XSLFTextShape textShape)
                    || !TOKEN.matcher(textShape.getText()).find()) continue;
            var layout = byId.get(textLayoutId(slideNumber, ++layoutIndex));
            if (layout == null) continue;
            textShape.setAnchor(
                    new Rectangle2D.Double(
                            pageWidth * layout.x() / 100,
                            pageHeight * layout.y() / 100,
                            pageWidth * layout.width() / 100,
                            pageHeight * layout.height() / 100));
        }
    }

    private static String textLayoutId(int slideNumber, int layoutIndex) {
        return "slide-" + slideNumber + "-layout-" + layoutIndex;
    }

    /** Creates a new PPTX text box for a user-created editor block. */
    private static void addTextBlock(
            XSLFSlide slide,
            PresentationContent.TextBlock block,
            double pageWidth,
            double pageHeight,
            String templateId) {
        var box = slide.createTextBox();
        box.setAnchor(
                new Rectangle2D.Double(
                        pageWidth * block.x() / 100,
                        pageHeight * block.y() / 100,
                        pageWidth * block.width() / 100,
                        pageHeight * block.height() / 100));
        box.setLeftInset(0);
        box.setRightInset(0);
        box.setTopInset(0);
        box.setBottomInset(0);
        box.setWordWrap(true);
        box.setVerticalAlignment(VerticalAlignment.TOP);
        XSLFTextRun run = box.setText(block.text());
        run.setFontSize(block.fontSize() * 0.75);
        run.setBold(block.weight() >= 700);
        run.setFontFamily("Arial");
        run.setFontColor(textColor(templateId, block.color()));
        XSLFTextParagraph paragraph = run.getParagraph();
        paragraph.setTextAlign(
                switch (block.align()) {
                    case "center" -> TextAlign.CENTER;
                    case "right" -> TextAlign.RIGHT;
                    default -> TextAlign.LEFT;
                });
        paragraph.setSpaceBefore(0d);
        paragraph.setSpaceAfter(0d);
    }

    /** Resolves a normalized asset and creates a positioned PNG picture shape in the slide. */
    private static void addImageBlock(
            XMLSlideShow show,
            XSLFSlide slide,
            PresentationContent.ImageBlock image,
            double pageWidth,
            double pageHeight,
            Function<String, byte[]> resolver) {
        byte[] bytes = resolver.apply(image.assetId());
        var pictureData = show.addPicture(bytes, PictureData.PictureType.PNG);
        var picture = slide.createPicture(pictureData);
        picture.setAnchor(
                new Rectangle2D.Double(
                        pageWidth * image.x() / 100,
                        pageHeight * image.y() / 100,
                        pageWidth * image.width() / 100,
                        pageHeight * image.height() / 100));
    }

    private static Color textColor(String templateId, String color) {
        boolean dark = "monolith".equals(templateId);
        return switch (color) {
            case "brand" -> dark ? new Color(0xD7F36A) : new Color(0x335CC5);
            case "muted" -> dark ? new Color(0xB4C0D3) : new Color(0x5B6675);
            default -> dark ? new Color(0xF5F7FB) : new Color(0x142033);
        };
    }

    private static Map<String, Integer> inspect(XMLSlideShow show) {
        Map<String, Integer> result = new LinkedHashMap<>();
        for (XSLFSlide slide : show.getSlides()) {
            for (XSLFShape shape : allShapes(slide.getShapes())) {
                if (!(shape instanceof XSLFTextShape textShape)) continue;
                int max = suggestedLimit(textShape);
                Matcher matcher = TOKEN.matcher(textShape.getText());
                while (matcher.find()) result.merge(matcher.group(1), max, Math::min);
            }
        }
        return result;
    }

    /**
     * Flattens top-level and grouped shapes in document order. The order is part of the stable
     * editor layout-id contract, so both manifest creation and rendering use this method.
     */
    private static List<XSLFShape> allShapes(List<XSLFShape> shapes) {
        List<XSLFShape> result = new ArrayList<>();
        for (XSLFShape shape : shapes) {
            result.add(shape);
            if (shape instanceof XSLFGroupShape group) result.addAll(allShapes(group.getShapes()));
        }
        return result;
    }

    private static int suggestedLimit(XSLFTextShape shape) {
        // POI exposes anchors and insets in points, not the EMU units used inside PPTX XML.
        double width =
                shape.getAnchor() == null
                        ? 0
                        : shape.getAnchor().getWidth()
                                - shape.getLeftInset()
                                - shape.getRightInset();
        double height =
                shape.getAnchor() == null
                        ? 0
                        : shape.getAnchor().getHeight()
                                - shape.getTopInset()
                                - shape.getBottomInset();
        double font =
                shape.getTextParagraphs().stream()
                        .flatMap(p -> p.getTextRuns().stream())
                        .map(XSLFTextRun::getFontSize)
                        .filter(java.util.Objects::nonNull)
                        .mapToDouble(Double::doubleValue)
                        .max()
                        .orElse(TemplateTextPolicy.DEFAULT_FONT_POINTS);
        if (width <= 0 || height <= 0) return TemplateTextPolicy.FALLBACK_FIELD_LENGTH;
        int estimate =
                (int)
                        (width
                                / (font * TemplateTextPolicy.AVERAGE_CHARACTER_WIDTH_EM)
                                * Math.max(1, height / (font * TemplateTextPolicy.LINE_HEIGHT_EM)));
        return Math.clamp(
                estimate, TemplateTextPolicy.MIN_FIELD_LENGTH, TemplateTextPolicy.MAX_FIELD_LENGTH);
    }

    private static XSLFTextRun firstRun(XSLFTextShape shape) {
        return shape.getTextParagraphs().stream()
                .flatMap(paragraph -> paragraph.getTextRuns().stream())
                .findFirst()
                .orElse(null);
    }

    private static int fontSize(XSLFTextRun run) {
        double points = run == null || run.getFontSize() == null ? 14 : run.getFontSize();
        return Math.clamp((int) Math.round(points * 4 / 3), 8, 96);
    }

    private static double percent(double value, double total) {
        return Math.round(value / total * 10_000.0) / 100.0;
    }

    private static String alignment(XSLFTextParagraph paragraph) {
        if (paragraph == null || paragraph.getTextAlign() == null) return "left";
        return switch (paragraph.getTextAlign()) {
            case CENTER -> "center";
            case RIGHT -> "right";
            default -> "left";
        };
    }

    private static String role(String field) {
        if (field.contains("VALUE") || field.matches(".*(?:METRIC|NUM)_?\\d*$")) return "metric";
        if (field.contains("SUBTITLE") || field.contains("INTRO")) return "subtitle";
        if (field.contains("TITLE") || field.equals("STATEMENT")) return "title";
        if (field.contains("FOOTER")
                || field.contains("AUTHOR")
                || field.contains("CONTACT")
                || field.contains("CAPTION")) return "caption";
        return "body";
    }

    private static String color(String role) {
        return switch (role) {
            case "metric" -> "brand";
            case "caption" -> "muted";
            default -> "ink";
        };
    }

    /**
     * Replaces markers after concatenating paragraph runs, then retains formatting from the first
     * run. Concatenation is necessary because PowerPoint may split one marker across XML runs.
     */
    private static void replaceParagraph(XSLFTextParagraph paragraph, Map<String, String> values) {
        List<XSLFTextRun> runs = paragraph.getTextRuns();
        if (runs.isEmpty()) return;
        String text = runs.stream().map(XSLFTextRun::getRawText).reduce("", String::concat);
        Matcher matcher = TOKEN.matcher(text);
        StringBuffer replaced = new StringBuffer();
        while (matcher.find()) {
            String value = values.get(matcher.group(1));
            if (value == null)
                throw new IllegalArgumentException(UNKNOWN_FIELD_PREFIX + matcher.group(1));
            matcher.appendReplacement(replaced, Matcher.quoteReplacement(value));
        }
        matcher.appendTail(replaced);
        if (replaced.toString().equals(text)) return;
        runs.getFirst().setText(replaced.toString());
        for (int i = 1; i < runs.size(); i++) runs.get(i).setText("");
    }
}
