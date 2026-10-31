package ru.godeck.presentation.template;

import static ru.godeck.presentation.template.TemplateShapes.allShapes;
import static ru.godeck.presentation.template.TemplateShapes.textLayoutId;
import static ru.godeck.presentation.template.TemplateShapes.TOKEN;

import org.apache.poi.xslf.usermodel.XMLSlideShow;
import org.apache.poi.xslf.usermodel.XSLFShape;
import org.apache.poi.xslf.usermodel.XSLFSlide;
import org.apache.poi.xslf.usermodel.XSLFTextRun;
import org.apache.poi.xslf.usermodel.XSLFTextShape;
import org.springframework.core.io.ClassPathResource;

import ru.godeck.common.text.BackendMessages;
import ru.godeck.presentation.exception.GenerationError;
import ru.godeck.presentation.exception.GenerationException;
import ru.godeck.presentation.model.PresentationContent;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;

/** Loads and inspects immutable template revisions; exposes one contract to editor and renderer. */
final class TemplateCatalog {
    private static final String TEMPLATE_MARKERS_MISSING = "The template has no {{FIELD}} markers.";

    public static final String TEMPLATE_ID = "aurora";
    private static final List<String> TEMPLATE_IDS =
            List.of(TEMPLATE_ID, "atlas", "monolith", "nord", "opal");
    private static final String TEMPLATE_DESCRIPTION_INVALID =
            "Invalid presentation template description: ";
    private static final String TEMPLATE_BRIEF =
            "Описание шаблона (JSON):\n%s\n\nЗадача пользователя: %s";
    private final Map<String, Template> templates;
    private final PresentationContentValidator validator;

    TemplateCatalog(ObjectMapper json, PresentationContentValidator validator)
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
                List<Map<String, Object>> manifest = readManifest(show);
                loaded.put(
                        id,
                        new Template(
                                source,
                                HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(source)),
                                java.util.Collections.unmodifiableMap(fields),
                                show.getSlides().size(),
                                description,
                                manifest,
                                readTextLayoutIds(show),
                                typedManifest(manifest)));
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
            String version,
            Map<String, Integer> fields,
            int slideCount,
            JsonNode description,
            List<Map<String, Object>> slideManifest,
            Map<Integer, List<String>> textLayoutIds,
            Map<Integer, List<String>> fieldsBySlide) {}

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

    /** Returns immutable template input for rendering, without exposing the registry's byte array. */
    public byte[] source(String id) {
        return get(id).source().clone();
    }

    /** Versions browser artwork URLs by source bytes so template updates invalidate old previews. */
    public String backgroundUrl(String id, int slideNumber) {
        return "/api/generation/v1/templates/" + id + "/slides/" + slideNumber
                + "/background.png?v=" + get(id).version();
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
    /** Cached manifest as typed data; callers do not cast public JSON catalog entries. */
    Map<Integer, List<String>> fieldsBySlide(String id) {
        return get(id).fieldsBySlide();
    }

    public List<String> textLayoutIds(String id, int slideNumber) {
        return get(id).textLayoutIds().getOrDefault(slideNumber, List.of());
    }

    private static Map<Integer, List<String>> typedManifest(List<Map<String, Object>> manifest) {
        Map<Integer, List<String>> result = new LinkedHashMap<>();
        for (var slide : manifest) {
            List<String> fields = ((List<?>) slide.get("fields")).stream().map(String.class::cast).toList();
            result.put((Integer) slide.get("slide"), fields);
        }
        return java.util.Collections.unmodifiableMap(result);
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
        return normalize(id, content, TextLengthMode.TRUNCATE);
    }

    /**
     * Produces the canonical snapshot for visual-editor paths (draft save, editor load, export).
     *
     * <p>Unlike {@link #normalize(String, PresentationContent)}, field text longer than {@code
     * max_chars} is kept intact up to {@link EditorTextLimits#hard(int)} and rejected above it. All
     * other checks are the same.
     */
    public PresentationContent normalizeEditor(String id, PresentationContent content) {
        return normalize(id, content, TextLengthMode.ALLOW_OVERFLOW);
    }

    PresentationContent normalize(
            String id, PresentationContent content, TextLengthMode mode) {
        Template template = get(id);
        return validator.normalize(content, template.fields(), template.slideCount(), mode);
    }

    XMLSlideShow open(String id) throws Exception {
        return new XMLSlideShow(new ByteArrayInputStream(get(id).source()));
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


}
