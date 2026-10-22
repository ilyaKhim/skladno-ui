package ru.godeck.presentation.ai;

import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Builds the same structured request for preview and actual generation. */
@Component
public class PresentationRequestFactory {
    private static final int MAX_OUTPUT_TOKENS = 12_000;

    public Map<String, Object> create(
            String topic,
            Map<String, Integer> fields,
            List<Map<String, Object>> slides,
            String model) {
        var fieldProperties = new LinkedHashMap<String, Object>();
        fields.keySet().forEach(key -> fieldProperties.put(key, Map.of("type", "string")));
        var slideProperties = new LinkedHashMap<String, Object>();
        slideProperties.put(
                "slide",
                Map.of(
                        "type",
                        "integer",
                        "enum",
                        slides.stream().map(slide -> slide.get("slide")).toList()));
        slideProperties.put("include", Map.of("type", "boolean"));
        slideProperties.put("reason", Map.of("type", "string"));
        var properties = new LinkedHashMap<String, Object>();
        properties.put("fields", objectSchema(fieldProperties));
        properties.put("slides", Map.of("type", "array", "items", objectSchema(slideProperties)));
        return Map.of(
                "model",
                model,
                "instructions",
                PresentationPrompts.instructions(),
                "input",
                PresentationPrompts.brief(topic, fields, slides),
                "text",
                Map.of(
                        "format",
                        Map.of(
                                "type",
                                "json_schema",
                                "name",
                                "presentation_content",
                                "strict",
                                true,
                                "schema",
                                objectSchema(properties))),
                "max_output_tokens",
                MAX_OUTPUT_TOKENS,
                "store",
                false);
    }

    private static Map<String, Object> objectSchema(Map<String, Object> properties) {
        return Map.of(
                "type",
                "object",
                "properties",
                properties,
                "required",
                new ArrayList<>(properties.keySet()),
                "additionalProperties",
                false);
    }
}
