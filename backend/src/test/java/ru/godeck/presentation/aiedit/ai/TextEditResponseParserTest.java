package ru.godeck.presentation.aiedit.ai;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import ru.godeck.presentation.exception.AiGenerationException;

import tools.jackson.databind.ObjectMapper;

import java.util.List;
import java.util.Map;

class TextEditResponseParserTest {
    private final ObjectMapper json = new ObjectMapper();
    private final TextEditResponseParser parser = new TextEditResponseParser(json);

    @Test
    void readsACompletedAnswerAndUsage() {
        var outcome =
                parser.parse(
                        envelope(
                                "completed",
                                List.of("{\"status\":\"ok\",\"message\":\"\",\"variants\":[{\"text\":\"Коротко\"}]}"),
                                Map.of(
                                        "input_tokens", 512,
                                        "input_tokens_details", Map.of("cached_tokens", 7),
                                        "output_tokens", 41,
                                        "output_tokens_details", Map.of("reasoning_tokens", 3))));
        assertThat(outcome.supported()).isTrue();
        assertThat(outcome.variants()).containsExactly("Коротко");
        assertThat(outcome.usage()).isEqualTo(new ResponsesUsage(512, 7, 41, 3));
    }

    @Test
    void joinsSeveralOutputTextParts() {
        var outcome =
                parser.parse(
                        envelope(
                                "completed",
                                List.of("{\"status\":\"ok\",\"mess", "age\":\"\",\"variants\":[{\"text\":\"А\"},{\"text\":\"Б\"}]}"),
                                null));
        assertThat(outcome.variants()).containsExactly("А", "Б");
        assertThat(outcome.usage()).isEqualTo(ResponsesUsage.NONE);
    }

    @Test
    void unsupportedHasNoVariants() {
        var outcome =
                parser.parse(
                        envelope(
                                "completed",
                                List.of("{\"status\":\"unsupported\",\"message\":\"Только текст.\",\"variants\":[]}"),
                                null));
        assertThat(outcome.supported()).isFalse();
        assertThat(outcome.message()).isEqualTo("Только текст.");
        assertThat(outcome.variants()).isEmpty();
    }

    @Test
    void incompleteResponseFails() {
        assertFailed(
                envelope(
                        "incomplete",
                        List.of("{\"status\":\"ok\",\"message\":\"\",\"variants\":[{\"text\":\"А\"}]}"),
                        null));
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "not json",
                "{\"status\":\"ok\",\"message\":\"\",\"variants\":[]}",
                "{\"status\":\"ok\",\"message\":\"\",\"variants\":[{\"text\":\"А\"}],\"extra\":1}",
                "{\"status\":\"ok\",\"message\":\"\",\"variants\":[{\"text\":\"А\",\"note\":\"x\"}]}",
                "{\"status\":\"maybe\",\"message\":\"\",\"variants\":[{\"text\":\"А\"}]}",
                "{\"status\":\"ok\",\"variants\":[{\"text\":\"А\"}]}",
                "{\"status\":\"ok\",\"message\":\"\",\"variants\":[{\"text\":5}]}",
                "[]"
            })
    void invalidAnswersFail(String answer) {
        assertFailed(envelope("completed", List.of(answer), null));
    }

    @Test
    void emptyOrMalformedEnvelopeFails() {
        assertFailed(envelope("completed", List.of(), null));
        assertFailed("{");
        assertFailed(null);
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
