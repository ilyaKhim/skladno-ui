package ru.godeck.presentation.aiedit.ai;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import ru.godeck.presentation.aiedit.config.AiEditClientConfig;
import ru.godeck.presentation.exception.AiGenerationException;
import ru.godeck.presentation.exception.GenerationError;
import ru.godeck.presentation.model.AiCallContext;
import ru.godeck.presentation.service.PresentationAiCallHistory;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.util.Map;
import java.util.UUID;
import java.util.function.Function;

/**
 * Audited POST to the OpenAI Responses API for AI edits.
 *
 * <p>Follows the generation audit rules: the redacted request is stored in {@code
 * presentation_ai_calls} before the HTTP call, and without that record no paid call is made. The
 * response, HTTP status, error code and token usage are stored best-effort afterwards, so a
 * diagnostics failure never discards a paid answer or replaces the provider error. The API key is
 * masked in everything stored.
 */
@Component
public class AiResponsesClient {
    private static final String RESPONSES_URL = "https://api.openai.com/v1/responses";
    private static final String REDACTED_KEY = "[REDACTED]";
    private static final String HISTORY_FAILURE_LOG =
            "Could not persist AI edit response: call={} failure={}";
    private static final Logger log = LoggerFactory.getLogger(AiResponsesClient.class);
    private final RestClient client;
    private final ObjectMapper json;
    private final PresentationAiCallHistory history;
    private final String apiKey;
    private final boolean enabled;

    public AiResponsesClient(
            @Qualifier(AiEditClientConfig.CLIENT) RestClient client,
            ObjectMapper json,
            PresentationAiCallHistory history,
            @Value("${godeck.generation.api-key:}") String apiKey,
            @Value("${godeck.generation.enabled:false}") boolean enabled) {
        this.client = client;
        this.json = json;
        this.history = history;
        this.apiKey = apiKey;
        this.enabled = enabled;
    }

    /** True only when AI is enabled and a nonblank provider key is configured. */
    public boolean enabled() {
        return enabled && !apiKey.isBlank();
    }

    /**
     * Sends one request and converts the response with {@code reader}.
     *
     * <p>Reader failures are recorded as the call's error, like provider failures.
     *
     * @throws AiGenerationException {@code openai_disabled} without a configured key, otherwise the
     *     reader's error or {@code ai_edit_failed}
     */
    public <T> T call(
            AiCallContext context,
            String model,
            Map<String, Object> request,
            Function<String, T> reader) {
        if (!enabled()) throw new AiGenerationException(GenerationError.OPENAI_DISABLED);
        String body = json.writeValueAsString(request);
        // Persist before a paid call. If the DB is unavailable, do not send an untracked request.
        UUID callId = history.start(context, model, redactKey(body));
        String responseBody = null;
        Integer httpStatus = null;
        GenerationError error = GenerationError.AI_EDIT_FAILED;
        try {
            var response =
                    client.post()
                            .uri(RESPONSES_URL)
                            .contentType(MediaType.APPLICATION_JSON)
                            .header("Authorization", "Bearer " + apiKey)
                            .body(body)
                            .retrieve()
                            .toEntity(String.class);
            responseBody = response.getBody();
            httpStatus = response.getStatusCode().value();
            T result = reader.apply(responseBody);
            error = null;
            return result;
        } catch (RestClientResponseException failure) {
            httpStatus = failure.getStatusCode().value();
            responseBody = failure.getResponseBodyAsString();
            throw new AiGenerationException(error, failure);
        } catch (AiGenerationException failure) {
            error = failure.error();
            throw failure;
        } catch (Exception failure) {
            throw new AiGenerationException(error, failure);
        } finally {
            recordResponse(callId, responseBody, httpStatus, error);
        }
    }

    /** Records redacted diagnostics and usage without replacing the primary outcome. */
    private void recordResponse(
            UUID callId, String body, Integer httpStatus, GenerationError error) {
        try {
            history.complete(
                    callId,
                    redactKey(body),
                    httpStatus,
                    error == null ? null : error.code(),
                    usage(body));
        } catch (RuntimeException failure) {
            log.warn(HISTORY_FAILURE_LOG, callId, failure.getClass().getSimpleName());
        }
    }

    private ResponsesUsage usage(String body) {
        if (body == null || body.isBlank()) return ResponsesUsage.NONE;
        try {
            JsonNode response = json.readTree(body);
            return ResponsesUsage.from(response);
        } catch (RuntimeException unreadable) {
            return ResponsesUsage.NONE;
        }
    }

    private String redactKey(String body) {
        return body == null || apiKey.isEmpty() ? body : body.replace(apiKey, REDACTED_KEY);
    }
}
