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

/** Validates slide decisions and field values without loading or rendering a PPTX. */
@Component
public class PresentationContentValidator {
    private static final String FIELDS_MISMATCH = "Fields do not match the template.";
    private static final String MISSING_FIELD = "Missing template field ";
    private static final String UNRESOLVED_MARKER = "Unresolved template marker.";

    public PresentationContent normalize(
            PresentationContent content, Map<String, Integer> fields, int slideCount) {
        try {
            if (content == null
                    || content.fields() == null
                    || content.slides() == null
                    || content.slides().size() != slideCount) throw new IllegalArgumentException();
            Map<String, String> values = normalizeValues(content.fields(), fields);
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
            return new PresentationContent(
                    Collections.unmodifiableMap(values), List.copyOf(content.slides()));
        } catch (IllegalArgumentException | NullPointerException invalid) {
            throw new GenerationException(GenerationError.INVALID_CONTENT);
        }
    }

    public Map<String, String> normalizeValues(
            Map<String, String> values, Map<String, Integer> fields) {
        if (!values.keySet().equals(fields.keySet()))
            throw new IllegalArgumentException(FIELDS_MISMATCH);
        Map<String, String> normalized = new LinkedHashMap<>();
        for (var field : fields.entrySet()) {
            String value = values.get(field.getKey());
            if (value == null) throw new IllegalArgumentException(MISSING_FIELD + field.getKey());
            if (value.contains("{{") || value.contains("}}"))
                throw new IllegalArgumentException(UNRESOLVED_MARKER);
            normalized.put(field.getKey(), limit(value, field.getValue()));
        }
        return normalized;
    }

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
