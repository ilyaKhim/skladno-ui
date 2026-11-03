package ru.godeck.presentation.aiedit.ai;

import org.springframework.stereotype.Component;

import ru.godeck.presentation.aiedit.core.AiEditFailureReason;
import ru.godeck.presentation.aiedit.core.AlternativeReason;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/**
 * Reads a Responses API envelope of a text edit.
 *
 * <p>Reads {@code usage} first, so a failed answer still reports its tokens. Requires {@code status:
 * completed}, joins every {@code output_text} part and parses the joined text strictly: exactly the
 * fields of the schema, each variant exactly {@code {text, check_facts}}. An {@code ok} answer
 * without variants and an unknown {@code reason} are invalid; variants of an {@code alternative} are
 * dropped. Any violation is {@code ai_edit_failed}; there is no retry.
 */
@Component
public class TextEditResponseParser {
    private static final String COMPLETED_STATUS = "completed";
    private static final String INCOMPLETE_STATUS = "incomplete";
    private static final String OUTPUT_TEXT_TYPE = "output_text";
    private static final Set<String> ANSWER_FIELDS =
            Set.of("status", "reason", "message", "suggestions", "variants");
    private static final Set<String> VARIANT_FIELDS = Set.of("text", "check_facts");
    private final ObjectMapper json;

    public TextEditResponseParser(ObjectMapper json) {
        this.json = json;
    }

    public TextEditOutcome parse(String body) {
        JsonNode response;
        try {
            response = body == null ? null : json.readTree(body);
        } catch (JacksonException invalid) {
            throw invalid(ResponsesUsage.NONE, invalid);
        }
        if (response == null) throw invalid(ResponsesUsage.NONE, null);
        ResponsesUsage usage = ResponsesUsage.from(response);
        String status = response.path("status").asText();
        if (INCOMPLETE_STATUS.equals(status))
            throw new TextEditCallException(
                    AiEditFailureReason.ofIncomplete(
                            response.path("incomplete_details").path("reason").asText()),
                    usage,
                    null);
        if (!COMPLETED_STATUS.equals(status)) throw invalid(usage, null);
        var content = new StringBuilder();
        for (JsonNode item : response.path("output"))
            for (JsonNode part : item.path("content"))
                if (OUTPUT_TEXT_TYPE.equals(part.path("type").asText())
                        && part.path("text").isString()) content.append(part.path("text").asText());
        if (content.isEmpty()) throw invalid(usage, null);
        return answer(content.toString(), usage).withUsage(usage);
    }

    private TextEditOutcome answer(String text, ResponsesUsage usage) {
        JsonNode answer;
        try {
            answer = json.readTree(text);
        } catch (JacksonException invalid) {
            throw invalid(usage, invalid);
        }
        if (answer == null || !answer.isObject() || !fields(answer).equals(ANSWER_FIELDS))
            throw invalid(usage, null);
        JsonNode status = answer.path("status");
        JsonNode reason = answer.path("reason");
        JsonNode message = answer.path("message");
        JsonNode suggestions = answer.path("suggestions");
        JsonNode variants = answer.path("variants");
        if (!status.isString()
                || !reason.isString()
                || !message.isString()
                || !suggestions.isArray()
                || !variants.isArray()) throw invalid(usage, null);
        List<String> requests = new ArrayList<>();
        for (JsonNode suggestion : suggestions) {
            if (!suggestion.isString()) throw invalid(usage, null);
            requests.add(suggestion.asText());
        }
        List<TextEditOutcome.Variant> parsed = new ArrayList<>();
        for (JsonNode variant : variants) {
            if (!variant.isObject()
                    || !fields(variant).equals(VARIANT_FIELDS)
                    || !variant.path("text").isString()
                    || !variant.path("check_facts").isBoolean()) throw invalid(usage, null);
            parsed.add(
                    new TextEditOutcome.Variant(
                            variant.path("text").asText(), variant.path("check_facts").asBoolean()));
        }
        boolean knownReason =
                TextEditRequestFactory.REASON_NONE.equals(reason.asText())
                        || AlternativeReason.parse(reason.asText()).isPresent();
        if (!knownReason) throw invalid(usage, null);
        return switch (status.asText()) {
            case TextEditRequestFactory.STATUS_OK -> {
                if (parsed.isEmpty()) throw invalid(usage, null);
                yield new TextEditOutcome(null, message.asText(), List.of(), parsed, null);
            }
            case TextEditRequestFactory.STATUS_ALTERNATIVE ->
                    new TextEditOutcome(
                            // A paid answer with reason "none" is still a reply, not a failure.
                            AlternativeReason.parse(reason.asText()).orElse(AlternativeReason.CLARIFY),
                            message.asText(),
                            requests,
                            List.of(),
                            null);
            default -> throw invalid(usage, null);
        };
    }

    private static Set<String> fields(JsonNode node) {
        return Set.copyOf(node.propertyNames());
    }

    private static TextEditCallException invalid(ResponsesUsage usage, Throwable cause) {
        return new TextEditCallException(AiEditFailureReason.SCHEMA, usage, cause);
    }
}
