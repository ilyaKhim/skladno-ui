package ru.godeck.presentation.ai;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import ru.godeck.presentation.exception.AiGenerationException;
import ru.godeck.presentation.exception.GenerationError;
import ru.godeck.presentation.model.AiCallContext;
import ru.godeck.presentation.model.PresentationContent;
import ru.godeck.presentation.service.PresentationAiCallHistory;

import tools.jackson.databind.ObjectMapper;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class PresentationContentGenerator {
    private static final String RESPONSES_URL = "https://api.openai.com/v1/responses";
    private static final String REDACTED_KEY = "[REDACTED]";
    private static final String HISTORY_FAILURE_LOG =
            "Could not persist AI response: call={} failure={}";
    private static final Logger log = LoggerFactory.getLogger(PresentationContentGenerator.class);
    private final RestClient client;
    private final ObjectMapper json;
    private final PresentationRequestFactory requests;
    private final OpenAiResponseReader responses;
    private final PresentationAiCallHistory history;
    private final String apiKey;
    private final boolean enabled;

    public PresentationContentGenerator(
            RestClient openAiClient,
            ObjectMapper json,
            PresentationRequestFactory requests,
            OpenAiResponseReader responses,
            PresentationAiCallHistory history,
            @Value("${godeck.generation.api-key:}") String apiKey,
            @Value("${godeck.generation.enabled:false}") boolean enabled) {
        this.client = openAiClient;
        this.json = json;
        this.requests = requests;
        this.responses = responses;
        this.history = history;
        this.apiKey = apiKey;
        this.enabled = enabled;
    }

    public boolean enabled() {
        return enabled && !apiKey.isBlank();
    }

    public Map<String, Object> preview(
            String topic,
            Map<String, Integer> fields,
            List<Map<String, Object>> slides,
            String model) {
        return requests.create(topic, fields, slides, model);
    }

    public PresentationContent generate(
            AiCallContext context,
            String topic,
            Map<String, Integer> fields,
            List<Map<String, Object>> slides,
            String model) {
        if (!enabled()) throw new AiGenerationException(GenerationError.OPENAI_DISABLED);
        String request = json.writeValueAsString(requests.create(topic, fields, slides, model));
        // Persist before a paid call. If the DB is unavailable, do not send an untracked request.
        UUID callId = history.start(context, model, redactKey(request));
        String responseBody = null;
        Integer httpStatus = null;
        GenerationError error = GenerationError.GENERATION_FAILED;
        try {
            var response =
                    client.post()
                            .uri(RESPONSES_URL)
                            .contentType(MediaType.APPLICATION_JSON)
                            .header("Authorization", "Bearer " + apiKey)
                            .body(request)
                            .retrieve()
                            .toEntity(String.class);
            responseBody = response.getBody();
            httpStatus = response.getStatusCode().value();
            var content = responses.read(responseBody);
            error = null;
            return content;
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

    private void recordResponse(
            UUID callId, String body, Integer httpStatus, GenerationError error) {
        try {
            history.complete(
                    callId, redactKey(body), httpStatus, error == null ? null : error.code());
        } catch (RuntimeException failure) {
            // A diagnostics failure must not discard a paid response or replace the provider error.
            log.warn(HISTORY_FAILURE_LOG, callId, failure.getClass().getSimpleName());
        }
    }

    private String redactKey(String body) {
        return body == null ? null : body.replace(apiKey, REDACTED_KEY);
    }
}
