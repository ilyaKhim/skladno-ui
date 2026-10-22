package ru.godeck.presentation.ai;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import ru.godeck.presentation.exception.GenerationError;
import ru.godeck.presentation.mapper.PresentationContentCodec;
import ru.godeck.presentation.model.AiCallContext;
import ru.godeck.presentation.model.PresentationContent;
import ru.godeck.presentation.service.PresentationAiCallHistory;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class PresentationContentGenerator {
    private static final String RESPONSES_URL = "https://api.openai.com/v1/responses";
    private static final String COMPLETED_STATUS = "completed";
    private static final String OUTPUT_TEXT_TYPE = "output_text";
    private static final int MAX_OUTPUT_TOKENS = 12_000;

    private final RestClient client;
    private final ObjectMapper json;
    private final PresentationAiCallHistory history;
    private final PresentationContentCodec codec;
    private final String apiKey;
    private final boolean enabled;

    public PresentationContentGenerator(
            PresentationContentCodec codec,
            RestClient openAiClient,
            ObjectMapper json,
            PresentationAiCallHistory history,
            @Value("${godeck.generation.api-key:}") String apiKey,
            @Value("${godeck.generation.enabled:false}") boolean enabled) {
        this.codec = codec;
        this.json = json;
        this.history = history;
        this.apiKey = apiKey;
        this.enabled = enabled;
        this.client = openAiClient;
    }

    public boolean enabled() {
        return enabled && !apiKey.isBlank();
    }

    public Map<String, Object> preview(
            String topic,
            Map<String, Integer> fields,
            List<Map<String, Object>> slideManifest,
            String selectedModel) {
        return requestBody(topic, fields, slideManifest, selectedModel);
    }

    public PresentationContent generate(
            AiCallContext context,
            String topic,
            Map<String, Integer> fields,
            List<Map<String, Object>> slideManifest,
            String selectedModel) {
        if (!enabled()) throw new IllegalStateException(GenerationError.OPENAI_DISABLED.code());
        String requestBody =
                json.writeValueAsString(requestBody(topic, fields, slideManifest, selectedModel));
        var callId = history.start(context, selectedModel, redactKey(requestBody));
        String responseBody = null;
        Integer httpStatus = null;
        String errorCode = GenerationError.GENERATION_FAILED.code();
        try {
            var response =
                    client.post()
                            .uri(RESPONSES_URL)
                            .contentType(MediaType.APPLICATION_JSON)
                            .header("Authorization", "Bearer " + apiKey)
                            .body(requestBody)
                            .retrieve()
                            .toEntity(String.class);
            responseBody = response.getBody();
            httpStatus = response.getStatusCode().value();
            JsonNode responseJson = responseBody == null ? null : json.readTree(responseBody);
            if (responseJson == null
                    || !COMPLETED_STATUS.equals(responseJson.path("status").asText())) {
                throw new IllegalStateException(GenerationError.GENERATION_INCOMPLETE.code());
            }
            String contentJson = findOutputText(responseJson.path("output"));
            if (contentJson == null)
                throw new IllegalStateException(GenerationError.GENERATION_EMPTY.code());
            var content = codec.decode(contentJson);
            errorCode = null;
            return content;
        } catch (RestClientResponseException e) {
            httpStatus = e.getStatusCode().value();
            responseBody = e.getResponseBodyAsString();
            throw new IllegalStateException(GenerationError.GENERATION_FAILED.code());
        } catch (IllegalStateException e) {
            if (GenerationError.GENERATION_INCOMPLETE.code().equals(e.getMessage())
                    || GenerationError.GENERATION_EMPTY.code().equals(e.getMessage())) {
                errorCode = e.getMessage();
            }
            throw new IllegalStateException(errorCode);
        } catch (Exception e) {
            throw new IllegalStateException(GenerationError.GENERATION_FAILED.code());
        } finally {
            history.complete(callId, redactKey(responseBody), httpStatus, errorCode);
        }
    }

    private String redactKey(String body) {
        return body == null ? null : body.replace(apiKey, "[REDACTED]");
    }

    private Map<String, Object> requestBody(
            String topic,
            Map<String, Integer> fields,
            List<Map<String, Object>> slideManifest,
            String selectedModel) {
        Map<String, Object> properties = new LinkedHashMap<>();
        fields.keySet().forEach(key -> properties.put(key, Map.of("type", "string")));
        Map<String, Object> fieldSchema =
                Map.of(
                        "type",
                        "object",
                        "properties",
                        properties,
                        "required",
                        new ArrayList<>(fields.keySet()),
                        "additionalProperties",
                        false);
        List<Integer> slideNumbers = slideNumbers(slideManifest);
        Map<String, Object> slideSchema =
                Map.of(
                        "type",
                        "object",
                        "properties",
                        Map.of(
                                "slide",
                                Map.of("type", "integer", "enum", slideNumbers),
                                "include",
                                Map.of("type", "boolean"),
                                "reason",
                                Map.of("type", "string")),
                        "required",
                        List.of("slide", "include", "reason"),
                        "additionalProperties",
                        false);
        Map<String, Object> schema =
                Map.of(
                        "type",
                        "object",
                        "properties",
                        Map.of(
                                "fields",
                                fieldSchema,
                                "slides",
                                Map.of("type", "array", "items", slideSchema)),
                        "required",
                        List.of("fields", "slides"),
                        "additionalProperties",
                        false);
        Map<String, Object> request =
                Map.of(
                        "model",
                        selectedModel,
                        "instructions",
                        PresentationPrompts.instructions(),
                        "input",
                        PresentationPrompts.brief(topic, fields, slideManifest),
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
                                        schema)),
                        "max_output_tokens",
                        MAX_OUTPUT_TOKENS,
                        "store",
                        false);
        return request;
    }

    private static List<Integer> slideNumbers(List<Map<String, Object>> slideManifest) {
        return slideManifest.stream().map(slide -> (Integer) slide.get("slide")).toList();
    }

    private static String findOutputText(JsonNode output) {
        if (!output.isArray()) return null;
        for (JsonNode item : output) {
            JsonNode content = item.path("content");
            if (!content.isArray()) continue;
            for (JsonNode part : content) {
                if (OUTPUT_TEXT_TYPE.equals(part.path("type").asText()))
                    return part.path("text").asText();
            }
        }
        return null;
    }
}
