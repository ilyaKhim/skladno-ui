package ru.godeck.presentation.aiedit.ai;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import ru.godeck.presentation.aiedit.action.TextEditAction;
import ru.godeck.presentation.aiedit.action.builtin.CustomAction;
import ru.godeck.presentation.aiedit.action.builtin.RephraseAction;
import ru.godeck.presentation.aiedit.action.builtin.ShortenAction;
import ru.godeck.presentation.aiedit.core.AiEditTarget;
import ru.godeck.presentation.aiedit.core.ResolvedTextTarget;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.util.Map;
import java.util.UUID;

class TextEditRequestFactoryTest {
    private static final String SOURCE =
            "Мы помогаем командам продаж готовить презентации быстро, без дизайнера и без лишней"
                    + " головной боли";
    private final ObjectMapper json = new ObjectMapper();
    private final TextEditRequestFactory factory = new TextEditRequestFactory(json);
    private final ResolvedTextTarget target =
            new ResolvedTextTarget(
                    UUID.randomUUID(),
                    "atlas",
                    new AiEditTarget.TemplateFieldTarget(1, "SUBTITLE"),
                    110,
                    220,
                    220,
                    "Одна фраза: о чём и для кого",
                    "GoDeck для отделов продаж",
                    "Почему это важно");

    @Test
    void shortenInputSnapshot() {
        assertThat(input(new ShortenAction(), Map.of(), "gpt-5.4-mini").toString())
                .isEqualTo(
                        "{\"task\":\"Сократи текст, сохранив главную мысль. Целевая длина ≤ 68"
                                + " символов.\",\"max_chars\":110,\"role\":\"Одна фраза: о чём и для"
                                + " кого\",\"deck_title\":\"GoDeck для отделов"
                                + " продаж\",\"slide_title\":\"Почему это"
                                + " важно\",\"request\":null,\"variants\":1,\"text\":\""
                                + SOURCE
                                + "\"}");
    }

    @Test
    void rephraseInputSnapshot() {
        assertThat(input(new RephraseAction(), Map.of(), "gpt-5.4-mini").path("task").asText())
                .isEqualTo(
                        "Переформулируй текст другими словами, сохранив смысл и примерно ту же"
                                + " длину. Целевая длина ≤ 97 символов.");
    }

    @Test
    void customInputCarriesOnlyTheRequestAndTheText() {
        JsonNode input =
                input(new CustomAction(), Map.of("instruction", "ещё короче"), "gpt-5.4-mini");
        assertThat(input.toString())
                .isEqualTo(
                        "{\"task\":\"Измени текст по просьбе пользователя из поля request. Целевая"
                                + " длина ≤ 110 символов.\",\"max_chars\":110,\"role\":\"Одна фраза:"
                                + " о чём и для кого\",\"deck_title\":\"GoDeck для отделов"
                                + " продаж\",\"slide_title\":\"Почему это важно\",\"request\":\"ещё"
                                + " короче\",\"variants\":1,\"text\":\""
                                + SOURCE
                                + "\"}");
    }

    @Test
    void requestHasStrictSchemaNoStorageAndOnlyMinimalContext() {
        JsonNode request = request(new ShortenAction(), Map.of(), "gpt-5.4-mini");
        assertThat(fieldNames(request))
                .containsExactly(
                        "model",
                        "instructions",
                        "input",
                        "text",
                        "max_output_tokens",
                        "store",
                        "reasoning");
        assertThat(request.path("store").asBoolean(true)).isFalse();
        assertThat(request.path("model").asText()).isEqualTo("gpt-5.4-mini");
        assertThat(request.path("instructions").asText()).isEqualTo(TextEditRequestFactory.instructions());
        assertThat(TextEditRequestFactory.instructions()).hasSizeLessThanOrEqualTo(900).doesNotContain("\r");
        JsonNode input = json.readTree(request.path("input").asText());
        assertThat(fieldNames(input))
                .containsExactly(
                        "task",
                        "max_chars",
                        "role",
                        "deck_title",
                        "slide_title",
                        "request",
                        "variants",
                        "text");
        assertThat(request.toString())
                .doesNotContain("topic", "history", "field_hints", "\"x\"", "geometry");
        JsonNode format = request.path("text").path("format");
        assertThat(format.path("type").asText()).isEqualTo("json_schema");
        assertThat(format.path("strict").asBoolean()).isTrue();
        JsonNode schema = format.path("schema");
        assertThat(schema.path("additionalProperties").asBoolean(true)).isFalse();
        assertThat(schema.path("required").toString()).isEqualTo("[\"status\",\"message\",\"variants\"]");
        assertThat(schema.path("properties").path("status").path("enum").toString())
                .isEqualTo("[\"ok\",\"unsupported\"]");
        JsonNode item = schema.path("properties").path("variants").path("items");
        assertThat(item.path("required").toString()).isEqualTo("[\"text\"]");
        assertThat(item.path("additionalProperties").asBoolean(true)).isFalse();
    }

    @Test
    void reasoningIsSentOnlyForConfiguredModels() {
        assertThat(request(new ShortenAction(), Map.of(), "gpt-5.4-mini").path("reasoning").path("effort").asText())
                .isEqualTo("low");
        assertThat(request(new ShortenAction(), Map.of(), "gpt-6.1-sol").has("reasoning")).isFalse();
    }

    @ParameterizedTest
    @CsvSource({"1, 46, 279", "1, 110, 311", "3, 47, 328", "3, 4000, 2048", "2, 1, 258"})
    void maxOutputTokensFollowsTheFormula(int variants, int maxChars, int expected) {
        assertThat(TextEditRequestFactory.maxOutputTokens(variants, maxChars)).isEqualTo(expected);
    }

    private JsonNode input(TextEditAction action, Map<String, String> params, String model) {
        return json.readTree(request(action, params, model).path("input").asText());
    }

    private JsonNode request(TextEditAction action, Map<String, String> params, String model) {
        String task =
                action.task(params, target)
                        + " Целевая длина ≤ %d символов.".formatted(action.targetLength(target, SOURCE));
        return json.valueToTree(
                factory.create(
                        new TextEditPrompt(
                                target.presentationId(),
                                model,
                                action.id(),
                                task,
                                target.maxChars(),
                                target.hardMaxChars(),
                                target.role(),
                                target.deckTitle(),
                                target.slideTitle(),
                                action.request(params),
                                1,
                                SOURCE)));
    }

    private static java.util.List<String> fieldNames(JsonNode node) {
        return java.util.List.copyOf(node.propertyNames());
    }
}
