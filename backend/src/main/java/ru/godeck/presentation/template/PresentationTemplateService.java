package ru.godeck.presentation.template;

import org.apache.poi.xslf.usermodel.XMLSlideShow;
import org.apache.poi.xslf.usermodel.XSLFGroupShape;
import org.apache.poi.xslf.usermodel.XSLFShape;
import org.apache.poi.xslf.usermodel.XSLFSlide;
import org.apache.poi.xslf.usermodel.XSLFTextParagraph;
import org.apache.poi.xslf.usermodel.XSLFTextRun;
import org.apache.poi.xslf.usermodel.XSLFTextShape;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import ru.godeck.common.text.BackendMessages;
import ru.godeck.presentation.exception.GenerationError;
import ru.godeck.presentation.exception.GenerationException;
import ru.godeck.presentation.model.PresentationContent;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class PresentationTemplateService {
    private static final String TEMPLATE_MARKERS_MISSING = "The template has no {{FIELD}} markers.";
    private static final String TEMPLATE_READ_FAILED = "Could not read the presentation template.";
    private static final String TEMPLATE_FIELDS_MISMATCH = "Fields do not match the template.";
    private static final String MISSING_FIELD_PREFIX = "Missing template field ";
    private static final String UNRESOLVED_MARKER = "Unresolved template marker.";
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

    public PresentationTemplateService() throws Exception {
        Map<String, Template> loaded = new LinkedHashMap<>();
        var json = new ObjectMapper();
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
                                description));
            }
        }
        templates = java.util.Collections.unmodifiableMap(loaded);
    }

    public List<Map<String, Object>> catalogs() {
        return TEMPLATE_IDS.stream().map(this::catalog).toList();
    }

    private Template get(String id) {
        Template template = id == null ? null : templates.get(id);
        if (template == null) throw new GenerationException(GenerationError.TEMPLATE_NOT_FOUND);
        return template;
    }

    public JsonNode description(String id) {
        return get(id).description().deepCopy();
    }

    public String withDescription(String id, String topic) {
        JsonNode description = get(id).description();
        return description.isEmpty() ? topic : TEMPLATE_BRIEF.formatted(description, topic);
    }

    private record Template(
            byte[] source, Map<String, Integer> fields, int slideCount, JsonNode description) {}

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

    public Map<String, Integer> fields() {
        return fields(TEMPLATE_ID);
    }

    public Map<String, Integer> fields(String id) {
        return get(id).fields();
    }

    public byte[] source() {
        return get(TEMPLATE_ID).source().clone();
    }

    public List<Map<String, Object>> slideManifest() {
        return slideManifest(TEMPLATE_ID);
    }

    public List<Map<String, Object>> slideManifest(String id) {
        try (XMLSlideShow show = open(id)) {
            List<Map<String, Object>> slides = new ArrayList<>();
            int number = 0;
            for (XSLFSlide slide : show.getSlides()) {
                number++;
                List<String> names = new ArrayList<>();
                for (XSLFShape shape : allShapes(slide.getShapes())) {
                    if (shape instanceof XSLFTextShape text) {
                        Matcher matcher = TOKEN.matcher(text.getText());
                        while (matcher.find())
                            if (!names.contains(matcher.group(1))) names.add(matcher.group(1));
                    }
                }
                slides.add(Map.of("slide", number, "fields", names));
            }
            return slides;
        } catch (Exception e) {
            throw new IllegalStateException(TEMPLATE_READ_FAILED, e);
        }
    }

    public Map<String, String> normalizeValues(Map<String, String> values) {
        return normalizeValues(values, fields());
    }

    private Map<String, String> normalizeValues(
            Map<String, String> values, Map<String, Integer> fields) {
        if (!values.keySet().equals(fields.keySet()))
            throw new IllegalArgumentException(TEMPLATE_FIELDS_MISMATCH);
        Map<String, String> normalized = new LinkedHashMap<>();
        for (var entry : fields.entrySet()) {
            String value = values.get(entry.getKey());
            if (value == null)
                throw new IllegalArgumentException(MISSING_FIELD_PREFIX + entry.getKey());
            if (value.contains("{{") || value.contains("}}"))
                throw new IllegalArgumentException(UNRESOLVED_MARKER);
            normalized.put(entry.getKey(), limit(value, entry.getValue()));
        }
        return normalized;
    }

    public PresentationContent normalize(PresentationContent content) {
        return normalize(TEMPLATE_ID, content);
    }

    public PresentationContent normalize(String id, PresentationContent content) {
        Template template = get(id);
        int slideCount = template.slideCount();
        try {
            if (content == null
                    || content.fields() == null
                    || content.slides() == null
                    || content.slides().size() != slideCount) throw new IllegalArgumentException();
            Map<String, String> values = normalizeValues(content.fields(), template.fields());
            var seen = new java.util.HashSet<Integer>();
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
            return new PresentationContent(
                    java.util.Collections.unmodifiableMap(values), List.copyOf(content.slides()));
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new GenerationException(GenerationError.INVALID_CONTENT);
        }
    }

    public byte[] render(PresentationContent content) throws Exception {
        return render(TEMPLATE_ID, content);
    }

    public byte[] render(String id, PresentationContent content) throws Exception {
        PresentationContent plan = normalize(id, content);
        Map<String, String> normalized = plan.fields();
        try (XMLSlideShow show = open(id)) {
            var included =
                    plan.slides().stream()
                            .filter(s -> Boolean.TRUE.equals(s.include()))
                            .map(PresentationContent.Slide::slide)
                            .collect(java.util.stream.Collectors.toSet());
            for (int i = show.getSlides().size() - 1; i >= 0; i--)
                if (!included.contains(i + 1)) show.removeSlide(i);
            for (XSLFSlide slide : show.getSlides()) {
                for (XSLFShape shape : allShapes(slide.getShapes())) {
                    if (shape instanceof XSLFTextShape textShape) {
                        for (XSLFTextParagraph paragraph : textShape.getTextParagraphs()) {
                            replaceParagraph(paragraph, normalized);
                        }
                    }
                }
            }
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            show.write(output);
            return output.toByteArray();
        }
    }

    private XMLSlideShow open(String id) throws Exception {
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

    private static String limit(String value, int max) {
        if (value.length() <= max) return value;
        if (max <= TemplateTextPolicy.MIN_LENGTH_FOR_ELLIPSIS) return value.substring(0, max);
        int end = max - 1;
        if (Character.isHighSurrogate(value.charAt(end - 1))
                && Character.isLowSurrogate(value.charAt(end))) end--;
        String cut = value.substring(0, end);
        int space = cut.lastIndexOf(' ');
        if (space >= (int) (max * TemplateTextPolicy.WORD_BOUNDARY_MINIMUM_FRACTION))
            cut = cut.substring(0, space);
        return cut.replaceAll("[ ,.;:—-]+$", "") + "…";
    }

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
