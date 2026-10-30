package ru.godeck.presentation.aiedit.ai;

import org.springframework.stereotype.Component;

import ru.godeck.presentation.exception.AiGenerationException;
import ru.godeck.presentation.exception.GenerationError;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/**
 * Reads a Responses API envelope of a text edit.
 *
 * <p>Requires {@code status: completed}, joins every {@code output_text} part and parses the joined
 * text strictly: exactly {@code status}, {@code message} and {@code variants}, each variant exactly
 * {@code {text}}. An {@code ok} answer without variants is invalid. Any violation is {@code
 * ai_edit_failed}; there is no retry.
 */
@Component
public class TextEditResponseParser {
    private static final String COMPLETED_STATUS = "completed";
    private static final String OUTPUT_TEXT_TYPE = "output_text";
    private static final Set<String> ANSWER_FIELDS = Set.of("status", "message", "variants");
    private static final Set<String> VARIANT_FIELDS = Set.of("text");
    private final ObjectMapper json;

    public TextEditResponseParser(ObjectMapper json) {
        this.json = json;
    }

    public TextEditOutcome parse(String body) {
        JsonNode response;
        try {
            response = body == null ? null : json.readTree(body);
        } catch (JacksonException invalid) {
            throw failed(invalid);
        }
        if (response == null || !COMPLETED_STATUS.equals(response.path("status").asText()))
            throw failed(null);
        var content = new StringBuilder();
        for (JsonNode item : response.path("output"))
            for (JsonNode part : item.path("content"))
                if (OUTPUT_TEXT_TYPE.equals(part.path("type").asText())
                        && part.path("text").isString()) content.append(part.path("text").asText());
        if (content.isEmpty()) throw failed(null);
        return answer(content.toString()).withUsage(ResponsesUsage.from(response));
    }

    private TextEditOutcome answer(String text) {
        JsonNode answer;
        try {
            answer = json.readTree(text);
        } catch (JacksonException invalid) {
            throw failed(invalid);
        }
        if (answer == null || !answer.isObject() || !fields(answer).equals(ANSWER_FIELDS))
            throw failed(null);
        JsonNode status = answer.path("status");
        JsonNode message = answer.path("message");
        JsonNode variants = answer.path("variants");
        if (!status.isString() || !message.isString() || !variants.isArray()) throw failed(null);
        List<String> texts = new ArrayList<>();
        for (JsonNode variant : variants) {
            if (!variant.isObject()
                    || !fields(variant).equals(VARIANT_FIELDS)
                    || !variant.path("text").isString()) throw failed(null);
            texts.add(variant.path("text").asText());
        }
        return switch (status.asText()) {
            case TextEditRequestFactory.STATUS_OK -> {
                if (texts.isEmpty()) throw failed(null);
                yield new TextEditOutcome(true, message.asText(), texts, null);
            }
            case TextEditRequestFactory.STATUS_UNSUPPORTED ->
                    new TextEditOutcome(false, message.asText(), List.of(), null);
            default -> throw failed(null);
        };
    }

    private static Set<String> fields(JsonNode node) {
        return Set.copyOf(node.propertyNames());
    }

    private static AiGenerationException failed(Throwable cause) {
        return new AiGenerationException(GenerationError.AI_EDIT_FAILED, cause);
    }
}
