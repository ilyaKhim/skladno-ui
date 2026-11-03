package ru.godeck.presentation.aiedit.ai;

import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import ru.godeck.presentation.aiedit.config.TextEditPromptSettings;
import ru.godeck.presentation.aiedit.core.AlternativeReason;

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
    public static final String STATUS_ALTERNATIVE = "alternative";
    public static final String REASON_NONE = "none";

    /** Journal name of the prompt; changes together with the first line of the prompt file. */
    public static final String PROMPT_VERSION = "text-edit-v2";

    private static final String INSTRUCTIONS = read("text-edit-instructions.txt");
    private final ObjectMapper json;
    private final TextEditPromptSettings settings;

    public TextEditRequestFactory(ObjectMapper json, TextEditPromptSettings settings) {
        this.json = json;
        this.settings = settings;
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
        String effort = settings.reasoningEfforts().get(prompt.model());
        if (effort != null && !effort.isBlank()) request.put("reasoning", Map.of("effort", effort));
        return request;
    }

    /** Applies the configured cap to a length-based budget; arithmetic stays wide until capped. */
    public int maxOutputTokens(int variants, int maxChars) {
        long perVariant = (maxChars + 1L) / 2;
        long budget = settings.baseOutputTokens() + variants * perVariant;
        return (int) Math.min(settings.maxOutputTokens(), budget);
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

    /**
     * {@code {status: ok|alternative, reason, message, suggestions: [string], variants: [{text,
     * check_facts}]}}, all required, strict.
     */
    private static Map<String, Object> schema() {
        Map<String, Object> variant = new LinkedHashMap<>();
        variant.put("text", Map.of("type", "string"));
        variant.put("check_facts", Map.of("type", "boolean"));
        List<String> reasons = new ArrayList<>(List.of(REASON_NONE));
        for (AlternativeReason reason : AlternativeReason.values()) reasons.add(reason.value());
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("status", Map.of("type", "string", "enum", List.of(STATUS_OK, STATUS_ALTERNATIVE)));
        properties.put("reason", Map.of("type", "string", "enum", reasons));
        properties.put("message", Map.of("type", "string"));
        properties.put("suggestions", Map.of("type", "array", "items", Map.of("type", "string")));
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
