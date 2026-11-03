package ru.godeck.presentation.aiedit.ai;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import ru.godeck.presentation.aiedit.core.AiEditFailureReason;
import ru.godeck.presentation.aiedit.core.AlternativeReason;
import ru.godeck.presentation.exception.AiGenerationException;

import tools.jackson.databind.ObjectMapper;

import java.util.List;
import java.util.Map;

class TextEditResponseParserTest {
    private static final String OK_ANSWER =
            "{\"status\":\"ok\",\"reason\":\"none\",\"message\":\"\",\"suggestions\":[],"
                    + "\"variants\":[{\"text\":\"А\",\"check_facts\":false}]}";
    private static final Map<String, Object> USAGE =
            Map.of(
                    "input_tokens", 512,
                    "input_tokens_details", Map.of("cached_tokens", 7),
                    "output_tokens", 41,
                    "output_tokens_details", Map.of("reasoning_tokens", 3));
    private final ObjectMapper json = new ObjectMapper();
    private final TextEditResponseParser parser = new TextEditResponseParser(json);

    @Test
    void readsACompletedAnswerAndUsage() {
        var outcome =
                parser.parse(
                        envelope(
                                "completed",
                                List.of(
                                        "{\"status\":\"ok\",\"reason\":\"none\",\"message\":\"\",\"suggestions\":[],"
                                                + "\"variants\":[{\"text\":\"Коротко\",\"check_facts\":true}]}"),
                                USAGE));
        assertThat(outcome.alternative()).isFalse();
        assertThat(outcome.reason()).isNull();
        assertThat(outcome.variants()).containsExactly(new TextEditOutcome.Variant("Коротко", true));
        assertThat(outcome.usage()).isEqualTo(new ResponsesUsage(512, 7, 41, 3));
    }

    @Test
    void joinsSeveralOutputTextParts() {
        var outcome = parser.parse(envelope("completed", List.of(OK_ANSWER.substring(0, 20), OK_ANSWER.substring(20)), null));
        assertThat(outcome.variants()).containsExactly(new TextEditOutcome.Variant("А", false));
        assertThat(outcome.usage()).isEqualTo(ResponsesUsage.NONE);
    }

    @ParameterizedTest
    @CsvSource({
        "needs_source, NEEDS_SOURCE",
        "style_panel, STYLE_PANEL",
        "out_of_scope, OUT_OF_SCOPE",
        "advice, ADVICE",
        "clarify, CLARIFY"
    })
    void readsEveryAlternativeReason(String reason, AlternativeReason expected) {
        var outcome = parser.parse(envelope("completed", List.of(alternative(reason, "Реплика", "[\"Сократи\"]", "[]")), null));
        assertThat(outcome.alternative()).isTrue();
        assertThat(outcome.reason()).isEqualTo(expected);
        assertThat(outcome.message()).isEqualTo("Реплика");
        assertThat(outcome.suggestions()).containsExactly("Сократи");
        assertThat(outcome.variants()).isEmpty();
    }

    @Test
    void variantsOfAnAlternativeAreDropped() {
        var outcome =
                parser.parse(
                        envelope(
                                "completed",
                                List.of(alternative("advice", "Совет", "[]", "[{\"text\":\"А\",\"check_facts\":false}]")),
                                null));
        assertThat(outcome.variants()).isEmpty();
    }

    @Test
    void alternativeWithoutAReasonIsAQuestionNotAFailure() {
        assertThat(parser.parse(envelope("completed", List.of(alternative("none", "Что изменить?", "[]", "[]")), null)).reason())
                .isEqualTo(AlternativeReason.CLARIFY);
    }

    @Test
    void reasonOfAnOkAnswerIsIgnored() {
        var outcome =
                parser.parse(
                        envelope(
                                "completed",
                                List.of(OK_ANSWER.replace("\"reason\":\"none\"", "\"reason\":\"advice\"")),
                                null));
        assertThat(outcome.alternative()).isFalse();
    }

    @ParameterizedTest
    @CsvSource({
        "max_output_tokens, MAX_OUTPUT, max_output_tokens",
        "content_filter, CONTENT_FILTER, content_filter",
        "secret provider text, INCOMPLETE_OTHER, other"
    })
    void incompleteResponseKeepsUsageAndAWhitelistedReason(
            String reason, AiEditFailureReason expected, String journalValue) {
        var body = new java.util.LinkedHashMap<String, Object>();
        body.put("status", "incomplete");
        body.put("incomplete_details", Map.of("reason", reason));
        body.put("output", List.of());
        body.put("usage", USAGE);
        assertThatThrownBy(() -> parser.parse(json.writeValueAsString(body)))
                .isInstanceOfSatisfying(
                        TextEditCallException.class,
                        failure -> {
                            assertThat(failure.failureReason()).isEqualTo(expected);
                            assertThat(failure.failureReason().incompleteReason()).isEqualTo(journalValue);
                            assertThat(failure.usage()).isEqualTo(new ResponsesUsage(512, 7, 41, 3));
                            assertThat(failure.error().code()).isEqualTo("ai_edit_failed");
                        });
    }

    @Test
    void incompleteResponseWithoutDetailsIsOther() {
        assertThatThrownBy(() -> parser.parse(envelope("incomplete", List.of(OK_ANSWER), null)))
                .isInstanceOfSatisfying(
                        TextEditCallException.class,
                        failure -> assertThat(failure.failureReason()).isEqualTo(AiEditFailureReason.INCOMPLETE_OTHER));
    }

    @Test
    void invalidAnswerStillReportsItsTokens() {
        assertThatThrownBy(() -> parser.parse(envelope("completed", List.of("not json"), USAGE)))
                .isInstanceOfSatisfying(
                        TextEditCallException.class,
                        failure -> {
                            assertThat(failure.failureReason()).isEqualTo(AiEditFailureReason.SCHEMA);
                            assertThat(failure.usage().inputTokens()).isEqualTo(512);
                        });
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "not json",
                "{\"status\":\"ok\",\"reason\":\"none\",\"message\":\"\",\"suggestions\":[],\"variants\":[]}",
                "{\"status\":\"ok\",\"reason\":\"none\",\"message\":\"\",\"suggestions\":[],\"variants\":[{\"text\":\"А\",\"check_facts\":false}],\"extra\":1}",
                "{\"status\":\"ok\",\"reason\":\"none\",\"message\":\"\",\"suggestions\":[],\"variants\":[{\"text\":\"А\",\"check_facts\":false,\"note\":\"x\"}]}",
                "{\"status\":\"ok\",\"reason\":\"none\",\"message\":\"\",\"suggestions\":[],\"variants\":[{\"text\":\"А\"}]}",
                "{\"status\":\"ok\",\"reason\":\"none\",\"message\":\"\",\"suggestions\":[],\"variants\":[{\"text\":\"А\",\"check_facts\":\"да\"}]}",
                "{\"status\":\"ok\",\"reason\":\"none\",\"message\":\"\",\"suggestions\":[],\"variants\":[{\"text\":5,\"check_facts\":false}]}",
                "{\"status\":\"maybe\",\"reason\":\"none\",\"message\":\"\",\"suggestions\":[],\"variants\":[{\"text\":\"А\",\"check_facts\":false}]}",
                "{\"status\":\"unsupported\",\"reason\":\"none\",\"message\":\"Нет\",\"suggestions\":[],\"variants\":[]}",
                "{\"status\":\"alternative\",\"reason\":\"whatever\",\"message\":\"Нет\",\"suggestions\":[],\"variants\":[]}",
                "{\"status\":\"alternative\",\"reason\":\"advice\",\"message\":\"Нет\",\"suggestions\":[1],\"variants\":[]}",
                "{\"status\":\"alternative\",\"reason\":\"advice\",\"message\":\"Нет\",\"suggestions\":\"x\",\"variants\":[]}",
                "{\"status\":\"ok\",\"message\":\"\",\"variants\":[{\"text\":\"А\",\"check_facts\":false}]}",
                "[]"
            })
    void invalidAnswersFail(String answer) {
        assertFailed(envelope("completed", List.of(answer), null));
    }

    @Test
    void emptyOrMalformedEnvelopeFails() {
        assertFailed(envelope("completed", List.of(), null));
        assertFailed(envelope("failed", List.of(OK_ANSWER), null));
        assertFailed("{");
        assertFailed(null);
    }

    private static String alternative(String reason, String message, String suggestions, String variants) {
        return "{\"status\":\"alternative\",\"reason\":\"%s\",\"message\":\"%s\",\"suggestions\":%s,\"variants\":%s}"
                .formatted(reason, message, suggestions, variants);
    }

    private void assertFailed(String body) {
        assertThatThrownBy(() -> parser.parse(body))
                .isInstanceOfSatisfying(
                        AiGenerationException.class,
                        error -> assertThat(error.error().code()).isEqualTo("ai_edit_failed"));
    }

    private String envelope(String status, List<String> parts, Map<String, Object> usage) {
        var content =
                parts.stream().map(text -> Map.of("type", "output_text", "text", text)).toList();
        var body = new java.util.LinkedHashMap<String, Object>();
        body.put("status", status);
        body.put("output", List.of(Map.of("type", "message", "content", content)));
        if (usage != null) body.put("usage", usage);
        return json.writeValueAsString(body);
    }
}
