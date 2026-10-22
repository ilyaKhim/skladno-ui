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
    private static final String TEMPLATE_MARKERS_MISSING =
            "The Aurora template has no {{FIELD}} markers.";
    private static final String TEMPLATE_READ_FAILED = "Could not read the presentation template.";
    private static final String TEMPLATE_FIELDS_MISMATCH = "Fields do not match the template.";
    private static final String MISSING_FIELD_PREFIX = "Missing template field ";
    private static final String UNRESOLVED_MARKER = "Unresolved template marker.";
    private static final String UNKNOWN_FIELD_PREFIX = "Unknown template field ";

    public static final String TEMPLATE_ID = "aurora";
    private static final Pattern TOKEN = Pattern.compile("\\{\\{([A-Za-z_][A-Za-z0-9_]*)}}");
    private final byte[] template;
    private final Map<String, Integer> fields;
    private final int slideCount;

    public PresentationTemplateService() throws Exception {
        try (InputStream input = new ClassPathResource("templates/aurora.pptx").getInputStream()) {
            template = input.readAllBytes();
        }
        try (XMLSlideShow show = open()) {
            slideCount = show.getSlides().size();
            fields = java.util.Collections.unmodifiableMap(inspect(show));
        }
        if (fields.isEmpty()) throw new IllegalStateException(TEMPLATE_MARKERS_MISSING);
    }

    public Map<String, Object> catalog() {
        return Map.of(
                "id",
                TEMPLATE_ID,
                "number",
                1,
                "name",
                BackendMessages.text("presentation.template.aurora.name"),
                "description",
                BackendMessages.text("presentation.template.aurora.description", slideCount),
                "available_slides",
                slideCount,
                "preview_url",
                "",
                "selection",
                "manual");
    }

    public Map<String, Integer> fields() {
        return fields;
    }

    public byte[] source() {
        return template.clone();
    }

    public List<Map<String, Object>> slideManifest() {
        try (XMLSlideShow show = open()) {
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
        try {
            if (content == null
                    || content.fields() == null
                    || content.slides() == null
                    || content.slides().size() != slideCount) throw new IllegalArgumentException();
            Map<String, String> values = normalizeValues(content.fields());
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
        PresentationContent plan = normalize(content);
        Map<String, String> normalized = plan.fields();
        try (XMLSlideShow show = open()) {
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

    private XMLSlideShow open() throws Exception {
        return new XMLSlideShow(new ByteArrayInputStream(template));
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
        String cut = value.substring(0, max - 1);
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
