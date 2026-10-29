package ru.godeck.presentation.aiedit.ai;

import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import ru.godeck.presentation.aiedit.policy.AiEditPolicy;

import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Builds the Responses API request of one text edit.
 *
 * <p>The request carries static instructions, a strict output schema and a compact JSON {@code
 * input} with only the source text, its limit, the field role, two titles, the user request and
 * the number of variants. History, the topic, the template description, other fields and geometry
 * are never part of it. The class is pure, so the exact payload is covered by unit tests.
 */
@Component
public class TextEditRequestFactory {
    public static final String SCHEMA_NAME = "text_edit";
    public static final String STATUS_OK = "ok";
    public static final String STATUS_UNSUPPORTED = "unsupported";
    private static final String INSTRUCTIONS = read("text-edit-instructions.txt");
    private final ObjectMapper json;

    public TextEditRequestFactory(ObjectMapper json) {
        this.json = json;
    }

    /** Static model instructions, with line endings normalized to LF. */
    public static String instructions() {
        return INSTRUCTIONS;
    }

    public Map<String, Object> create(TextEditPrompt prompt) {
        Map<String, Object> request = new LinkedHashMap<>();
        request.put("model", prompt.model());
        request.put("instructions", INSTRUCTIONS);
        request.put("input", json.writeValueAsString(input(prompt)));
        request.put(
                "text",
                Map.of(
                        "format",
                        Map.of(
                                "type",
                                "json_schema",
                                "name",
                                SCHEMA_NAME,
                                "strict",
                                true,
                                "schema",
                                schema())));
        request.put("max_output_tokens", maxOutputTokens(prompt.variants(), prompt.maxChars()));
        request.put("store", false);
        String effort = AiEditPolicy.REASONING_EFFORT_BY_MODEL.get(prompt.model());
        if (effort != null) request.put("reasoning", Map.of("effort", effort));
        return request;
    }

    /** {@code min(2048, 256 + variants × ceil(max_chars / 2))}. */
    public static int maxOutputTokens(int variants, int maxChars) {
        long perVariant = (maxChars + 1L) / 2;
        long budget = AiEditPolicy.BASE_OUTPUT_TOKENS + variants * perVariant;
        return (int) Math.min(AiEditPolicy.MAX_OUTPUT_TOKENS, budget);
    }

    /** The model-visible data, in a fixed key order; {@code max_chars} is always present. */
    private static Map<String, Object> input(TextEditPrompt prompt) {
        Map<String, Object> input = new LinkedHashMap<>();
        input.put("task", prompt.task());
        input.put("max_chars", prompt.maxChars());
        input.put("role", prompt.role());
        input.put("deck_title", prompt.deckTitle());
        input.put("slide_title", prompt.slideTitle());
        input.put("request", prompt.request());
        input.put("variants", prompt.variants());
        input.put("text", prompt.text());
        return input;
    }

    /** {@code {status: ok|unsupported, message, variants: [{text}]}}, all required, strict. */
    private static Map<String, Object> schema() {
        Map<String, Object> variant = new LinkedHashMap<>();
        variant.put("text", Map.of("type", "string"));
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("status", Map.of("type", "string", "enum", List.of(STATUS_OK, STATUS_UNSUPPORTED)));
        properties.put("message", Map.of("type", "string"));
        properties.put("variants", Map.of("type", "array", "items", objectSchema(variant)));
        return objectSchema(properties);
    }

    private static Map<String, Object> objectSchema(Map<String, Object> properties) {
        Map<String, Object> schema = new LinkedHashMap<>();
        schema.put("type", "object");
        schema.put("properties", properties);
        schema.put("required", new ArrayList<>(properties.keySet()));
        schema.put("additionalProperties", false);
        return schema;
    }

    private static String read(String file) {
        try (var stream = new ClassPathResource("prompts/" + file).getInputStream()) {
            return new String(stream.readAllBytes(), StandardCharsets.UTF_8)
                    .replace("\r\n", "\n")
                    .strip();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
