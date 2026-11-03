package ru.godeck.presentation.aiedit;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.ResultActions;


import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;

/**
 * Passes the whole control set through HTTP and the scripted model. It checks the code around the
 * model, not the quality of the text and not how a real model obeys the prompt.
 *
 * <p>An {@code *IntegrationTest} by name, unlike the task text: the suite needs PostgreSQL, and
 * {@code pnpm backend:test:unit} runs everything else without a database.
 */
@TestPropertySource(properties = "godeck.ai-edit.max-edits-per-window=1000")
class AiChatControlSetIntegrationTest extends AiChatIntegrationBase {
    private static final String CONTROL_SET = "golden/ai-chat-stage1-control-set.json";
    private static final int MAX_INSTRUCTIONS = 1800;
    private static final List<String> ALLOWED_REQUEST_FIELDS =
            List.of("model", "instructions", "input", "text", "max_output_tokens", "store", "reasoning");
    private static final List<String> ALLOWED_INPUT_FIELDS =
            List.of("task", "max_chars", "role", "deck_title", "slide_title", "request", "variants", "text");
    private static final List<String> DESIGN_PROMISES =
            List.of("обновил дизайн", "изменил стиль", "поменял шрифт", "увеличил", "сменил цвет");

    static Stream<JsonNode> records() throws IOException {
        try (InputStream file =
                AiChatControlSetIntegrationTest.class.getClassLoader().getResourceAsStream(CONTROL_SET)) {
            List<JsonNode> records = new ArrayList<>();
            new ObjectMapper().readTree(file.readAllBytes()).forEach(records::add);
            return records.stream();
        }
    }

    @Test
    void setHasTheAgreedSize() throws Exception {
        List<JsonNode> records = records().toList();
        assertThat(records).hasSize(60);
        assertThat(records.stream().map(record -> record.path("id").asText())).doesNotHaveDuplicates();
        assertThat(records.stream().filter(record -> !record.path("group").asText().equals("edge"))).hasSize(42);
    }

    @ParameterizedTest(name = "{index}: {0}")
    @MethodSource("records")
    void recordKeepsItsPromise(JsonNode record) throws Exception {
        Map<String, Object> request = request(record);
        ResultActions result = send(request);
        JsonNode expected = record.path("expected");
        assertThat(result.andReturn().getResponse().getStatus()).as(describe(record)).isEqualTo(expected.path("http").asInt());
        JsonNode response = read(result);
        if (expected.has("error")) {
            assertThat(response.path("error").path("code").asText()).isEqualTo(expected.path("error").asText());
            assertThat(response.path("error").path("message").asText()).isNotBlank();
            checkRecordedFailure(expected);
            return;
        }
        assertResponse(record, response);
        assertThat(response.path("status").asText()).isEqualTo(expected.path("status").asText());
        if (expected.has("reason"))
            assertThat(response.path("reason").asText()).isEqualTo(expected.path("reason").asText());
        if (expected.has("warning"))
            assertThat(response.path("variants").get(0).path("warnings").toString()).contains(expected.path("warning").asText());
        if (expected.has("fact_guard"))
            assertThat(journal(response, "fact_guard")).isEqualTo(expected.path("fact_guard").asText());
        assertProviderRequest();
        if (record.path("repeat_request").asBoolean()) {
            JsonNode replay = read(send(request));
            assertThat(replay.path("replayed").asBoolean()).isTrue();
            assertThat(replay.path("edit_id")).isEqualTo(response.path("edit_id"));
        }
    }

    private void checkRecordedFailure(JsonNode expected) {
        if (!expected.has("failure_reason")) return;
        var row = db.queryForMap("SELECT failure_reason, input_tokens, reasoning_tokens FROM presentation_ai_edits");
        assertThat(row.get("failure_reason")).isEqualTo(expected.path("failure_reason").asText());
        assertThat(row.get("input_tokens")).isNotNull();
        assertThat(row.get("reasoning_tokens")).isNotNull();
    }

    /** No dead end: every answer has a variant, or a message with something to press. */
    private void assertResponse(JsonNode record, JsonNode response) {
        String status = response.path("status").asText();
        assertThat(status).as(describe(record)).isNotEqualTo("unsupported");
        assertThat(response.has("reason")).isTrue();
        assertThat(response.path("suggestions").isArray()).isTrue();
        if (status.equals("ok")) {
            assertThat(response.path("variants").size()).isPositive();
            assertThat(response.path("suggestions").size()).isZero();
            assertThat(response.path("reason").isNull()).isTrue();
            return;
        }
        assertThat(response.path("message").asText()).as(describe(record)).isNotBlank();
        assertThat(response.path("variants").size()).isZero();
        if (status.equals("alternative")) {
            assertThat(response.path("suggestions").size()).as(describe(record)).isBetween(1, 3);
            response.path("suggestions").forEach(item -> assertThat(item.asText()).hasSizeLessThanOrEqualTo(80));
            assertThat(response.path("message").asText().toLowerCase()).doesNotContain(DESIGN_PROMISES);
            assertThat(response.path("suggestions").toString().toLowerCase()).doesNotContain(DESIGN_PROMISES);
        }
    }

    private void assertProviderRequest() {
        JsonNode sent =
                json.readTree(
                        db.queryForObject(
                                "SELECT request_body FROM presentation_ai_calls ORDER BY started_at DESC LIMIT 1", String.class));
        assertThat(List.copyOf(sent.propertyNames())).isEqualTo(ALLOWED_REQUEST_FIELDS);
        assertThat(List.copyOf(json.readTree(sent.path("input").asText()).propertyNames())).isEqualTo(ALLOWED_INPUT_FIELDS);
        assertThat(sent.path("instructions").asText()).hasSizeLessThanOrEqualTo(MAX_INSTRUCTIONS);
        assertThat(sent.path("store").asBoolean(true)).isFalse();
    }

    private Object journal(JsonNode response, String column) {
        return db.queryForMap("SELECT * FROM presentation_ai_edits WHERE id=?", UUID.fromString(response.path("edit_id").asText())).get(column);
    }

    private Map<String, Object> request(JsonNode record) {
        String action = record.path("action").asText("custom");
        String source = source(record);
        Map<String, Object> target = target(record);
        if (!action.equals("custom")) return request(action, Map.of(), target, source);
        String phrase = record.path("phrase").asText();
        int length = record.path("instruction_length").asInt(0);
        if (length > 0) phrase = "п".repeat(length);
        String stub = record.path("stub").asText("");
        return custom(stub.isEmpty() ? phrase : phrase + " " + stub, target, source);
    }

    private static String source(JsonNode record) {
        int length = record.path("source_length").asInt(0);
        if (length > 0) return "текст ".repeat(length).substring(0, length - 1) + "я";
        return record.path("source").asText("Оппозитный двигатель остаётся основой марки");
    }

    private Map<String, Object> target(JsonNode record) {
        return switch (record.path("target").asText("field")) {
            case "block" -> blockTarget();
            case "foreign" -> fieldTarget("slide-1", foreignField());
            case "footer" -> fieldTarget(footerSlide(), FOOTER);
            default -> fieldTarget();
        };
    }

    private static final String FOOTER = "FOOTER";

    /** {@code FOOTER} is shared by many slides; a request names one of them, here an included one. */
    @SuppressWarnings("unchecked")
    private String footerSlide() {
        var manifest = templates.slideManifest(TEMPLATE);
        for (int index = 0; index < manifest.size(); index++) {
            if (((List<String>) manifest.get(index).get("fields")).contains(FOOTER)) {
                int number = index + 1;
                id = readyPresentation(OWNER, slide -> slide == number);
                return "slide-" + number;
            }
        }
        throw new IllegalStateException("The template has no FOOTER field");
    }

    private static String describe(JsonNode record) {
        return record.path("id").asText() + " " + record.path("phrase").asText();
    }
}
