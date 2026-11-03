package ru.godeck.presentation.aiedit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.ResultActions;

import ru.godeck.presentation.aiedit.ai.ScriptedTextEditLlm;
import ru.godeck.presentation.aiedit.ai.TextEditPrompt;
import ru.godeck.presentation.aiedit.text.FactGuard;

import tools.jackson.databind.JsonNode;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/** The AI feed, proposal outcomes, clearing and journal telemetry over HTTP. */
@TestPropertySource(properties = "godeck.ai-edit.max-edits-per-window=50")
@ExtendWith(OutputCaptureExtension.class)
class AiEditHistoryIntegrationTest extends AiChatIntegrationBase {
    static final String HISTORY = "/api/generation/v1/presentations/{id}/editor/ai/history";
    static final String OUTCOME = "/api/generation/v1/presentations/{id}/editor/ai/edits/{editId}/outcome";
    static final String CALLS = "/api/generation/v1/presentations/{id}/ai-calls";
    static final String SECRET_REQUEST = "секретная просьба пользователя";
    static final String SECRET_TEXT = "Секретный текст блока презентации";

    @MockitoSpyBean FactGuard factGuard;

    @Test
    void feedReturnsRecordsNewestFirstWithTheContractFields() throws Exception {
        String ok = edit(custom("сделай формальнее", fieldTarget(), "Мы делаем презентации быстро"));
        String alternative = edit(custom("добавь цитату " + ScriptedTextEditLlm.ALT_SOURCE, blockTarget(), "Заметка докладчика"));
        send(request("shorten", Map.of(), fieldTarget(), "Текст " + ScriptedTextEditLlm.FAIL)).andExpect(status().isBadGateway());

        JsonNode page =
                read(history("").andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store")));

        assertThat(page.path("next_before").isNull()).isTrue();
        JsonNode items = page.path("items");
        assertThat(items.size()).isEqualTo(3);
        JsonNode failed = items.get(0);
        assertThat(failed.path("status").asText()).isEqualTo("failed");
        assertThat(failed.path("action").asText()).isEqualTo("shorten");
        assertThat(failed.path("instruction").isNull()).isTrue();
        assertThat(failed.path("target").path("kind").asText()).isEqualTo("template_field");
        assertThat(failed.path("target").path("slide_id").asText()).isEqualTo("slide-1");
        assertThat(failed.path("target").path("field_key").asText()).isEqualTo(field);
        assertThat(failed.path("target").path("block_id").isNull()).isTrue();
        assertThat(failed.path("source_text").isNull()).isTrue();
        assertThat(failed.path("max_chars").isNull()).isTrue();
        assertThat(failed.path("hard_max_chars").isNull()).isTrue();
        assertThat(failed.path("variants").size()).isZero();
        assertThat(failed.path("suggestions").size()).isZero();

        JsonNode reply = items.get(1);
        assertThat(reply.path("edit_id").asText()).isEqualTo(alternative);
        assertThat(reply.path("status").asText()).isEqualTo("alternative");
        assertThat(reply.path("reason").asText()).isEqualTo("needs_source");
        assertThat(reply.path("message").asText()).isNotBlank();
        assertThat(reply.path("suggestions").size()).isPositive();
        assertThat(reply.path("target").path("kind").asText()).isEqualTo("custom_block");
        assertThat(reply.path("target").path("block_id").asText()).isEqualTo(BLOCK);
        assertThat(reply.path("target").path("field_key").isNull()).isTrue();

        JsonNode proposal = items.get(2);
        assertThat(List.copyOf(proposal.propertyNames()))
                .containsExactly(
                        "edit_id", "created_at", "refines_edit_id", "action", "instruction", "target", "status",
                        "reason", "message", "suggestions", "source_text", "max_chars", "hard_max_chars",
                        "variants", "outcome", "outcome_variant", "tracked");
        assertThat(proposal.path("edit_id").asText()).isEqualTo(ok);
        assertThat(proposal.path("instruction").asText()).isEqualTo("сделай формальнее");
        assertThat(proposal.path("status").asText()).isEqualTo("ok");
        assertThat(proposal.path("reason").isNull()).isTrue();
        assertThat(proposal.path("source_text").asText()).isEqualTo("Мы делаем презентации быстро");
        assertThat(proposal.path("max_chars").asInt()).isEqualTo(max);
        assertThat(proposal.path("variants").get(0).path("text").asText()).isNotBlank();
        assertThat(proposal.path("outcome").isNull()).isTrue();
        assertThat(proposal.path("tracked").asBoolean()).isTrue();
    }

    @Test
    void pagesFollowTheKeysetWithoutGapsOrRepeats() throws Exception {
        Instant same = Instant.now().truncatedTo(ChronoUnit.MILLIS);
        List<UUID> expected = new ArrayList<>();
        for (int index = 0; index < 5; index++) expected.add(insertEdit(OWNER, id, "ok", same.minusMillis(index % 2)));
        List<String> seen = new ArrayList<>();
        String before = null;
        int pages = 0;
        do {
            JsonNode page = read(history("?limit=2" + (before == null ? "" : "&before=" + before)).andExpect(status().isOk()));
            page.path("items").forEach(item -> seen.add(item.path("edit_id").asText()));
            assertThat(page.path("items").size()).isLessThanOrEqualTo(2);
            before = page.path("next_before").isNull() ? null : page.path("next_before").asText();
            pages++;
        } while (before != null);
        assertThat(pages).isEqualTo(3);
        assertThat(seen).hasSize(5).doesNotHaveDuplicates();
        assertThat(seen).containsExactlyInAnyOrderElementsOf(expected.stream().map(UUID::toString).toList());
    }

    @Test
    void exactLastPageHasNoCursor() throws Exception {
        insertEdit(OWNER, id, "ok", Instant.now());
        assertThat(read(history("?limit=1")).path("next_before").isNull()).isTrue();
    }

    @Test
    void feedHidesRunningClearedAndForeignRecords() throws Exception {
        UUID foreign = readyPresentation(OTHER);
        insertEdit(OTHER, foreign, "ok", Instant.now());
        insertEdit(OWNER, id, "running", Instant.now());
        UUID cleared = insertEdit(OWNER, id, "ok", Instant.now());
        db.update("UPDATE presentation_ai_edits SET cleared_at=now() WHERE id=?", cleared);
        UUID shown = insertEdit(OWNER, id, "ok", Instant.now());

        JsonNode items = read(history("")).path("items");

        assertThat(items.size()).isEqualTo(1);
        assertThat(items.get(0).path("edit_id").asText()).isEqualTo(shown.toString());
    }

    @Test
    void oldRecordsAreReadableAndUntracked() throws Exception {
        UUID old = insertEdit(OWNER, id, "unsupported", Instant.now());
        db.update(
                "UPDATE presentation_ai_edits SET result_json=? WHERE id=?",
                "{\"edit_id\":\"" + old + "\",\"status\":\"unsupported\",\"message\":\"Только текст.\","
                        + "\"action\":\"shorten\",\"source_text\":\"Было\",\"max_chars\":46,\"hard_max_chars\":146,"
                        + "\"variants\":[],\"replayed\":false}",
                old);

        JsonNode item = read(history("")).path("items").get(0);

        assertThat(item.path("status").asText()).isEqualTo("unsupported");
        assertThat(item.path("message").asText()).isEqualTo("Только текст.");
        assertThat(item.path("suggestions").size()).isZero();
        assertThat(item.path("source_text").asText()).isEqualTo("Было");
        assertThat(item.path("tracked").asBoolean()).isFalse();
    }

    @Test
    void invalidPagingIsInvalidInput() throws Exception {
        for (String query : List.of("?limit=0", "?limit=101", "?limit=abc", "?before=!!!", "?before=", "?before=YWJj"))
            history(query).andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.error.code").value("invalid_input"));
        history("?limit=100").andExpect(status().isOk());
    }

    @Test
    void routesRequireSessionCsrfAndOwnership() throws Exception {
        UUID edit = insertEdit(OWNER, id, "ok", Instant.now());
        mvc.perform(get(HISTORY, id)).andExpect(status().isUnauthorized());
        mvc.perform(delete(HISTORY, id).with(csrf())).andExpect(status().isUnauthorized());
        mvc.perform(post(OUTCOME, id, edit).with(csrf()).contentType("application/json").content("{\"outcome\":\"rejected\"}"))
                .andExpect(status().isUnauthorized());
        mvc.perform(delete(HISTORY, id).with(as(OWNER))).andExpect(status().isForbidden());
        mvc.perform(post(OUTCOME, id, edit).with(as(OWNER)).contentType("application/json").content("{\"outcome\":\"rejected\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(get(HISTORY, id).with(as(OTHER)))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.error.code").value("presentation_not_found"));
        mvc.perform(delete(HISTORY, id).with(as(OTHER)).with(csrf()))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.error.code").value("presentation_not_found"));
        outcome(OTHER, id, edit, "{\"outcome\":\"rejected\"}")
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.error.code").value("presentation_not_found"));
        mvc.perform(get(HISTORY, UUID.randomUUID()).with(as(OWNER))).andExpect(status().isNotFound());
        assertThat(db.queryForObject("SELECT outcome FROM presentation_ai_edits WHERE id=?", String.class, edit)).isNull();
    }

    @Test
    void outcomeIsStoredAndTheLastValueWins() throws Exception {
        var request = custom("сделай формальнее", fieldTarget(), "Мы делаем презентации быстро");
        request.put("variants", 2);
        JsonNode response = read(send(request).andExpect(status().isOk()));
        UUID edit = UUID.fromString(response.path("edit_id").asText());
        int callsBefore = callCount();

        outcome(OWNER, id, edit, "{\"outcome\":\"applied\",\"variant\":1}")
                .andExpect(status().isNoContent())
                .andExpect(header().string("Cache-Control", "no-store"));
        JsonNode item = read(history("")).path("items").get(0);
        assertThat(item.path("outcome").asText()).isEqualTo("applied");
        assertThat(item.path("outcome_variant").asInt()).isEqualTo(1);
        var row = db.queryForMap("SELECT outcome_at, status FROM presentation_ai_edits WHERE id=?", edit);
        assertThat(row.get("outcome_at")).isNotNull();

        outcome(OWNER, id, edit, "{\"outcome\":\"reverted\"}").andExpect(status().isNoContent());
        item = read(history("")).path("items").get(0);
        assertThat(item.path("outcome").asText()).isEqualTo("reverted");
        assertThat(item.path("outcome_variant").isNull()).isTrue();

        outcome(OWNER, id, edit, "{\"outcome\":\"applied\",\"variant\":0}").andExpect(status().isNoContent());
        outcome(OWNER, id, edit, "{\"outcome\":\"applied\",\"variant\":0}").andExpect(status().isNoContent());
        outcome(OWNER, id, edit, "{\"outcome\":\"rejected\",\"variant\":null}").andExpect(status().isNoContent());
        assertThat(read(history("")).path("items").get(0).path("outcome").asText()).isEqualTo("rejected");

        assertThat(callCount()).isEqualTo(callsBefore);
        assertThat(db.queryForObject("SELECT count(*) FROM presentation_ai_edits", Integer.class)).isEqualTo(1);
        verify(llm, times(1)).edit(any());
    }

    @Test
    void invalidOutcomesAreRejected() throws Exception {
        UUID edit = UUID.fromString(read(send(custom("сделай формальнее", fieldTarget(), "Мы делаем презентации быстро")).andExpect(status().isOk())).path("edit_id").asText());
        for (String body :
                List.of(
                        "{\"outcome\":\"applied\"}",
                        "{\"outcome\":\"applied\",\"variant\":1}",
                        "{\"outcome\":\"applied\",\"variant\":-1}",
                        "{\"outcome\":\"applied\",\"variant\":1.5}",
                        "{\"outcome\":\"rejected\",\"variant\":0}",
                        "{\"outcome\":\"maybe\"}",
                        "{\"variant\":0}",
                        "not json"))
            outcome(OWNER, id, edit, body)
                    .andExpect(status().isUnprocessableEntity())
                    .andExpect(jsonPath("$.error.code").value("invalid_input"));
        assertThat(db.queryForObject("SELECT outcome FROM presentation_ai_edits WHERE id=?", String.class, edit)).isNull();
    }

    @Test
    void outcomeOfAMissingForeignOrClearedRecordIsNotFound() throws Exception {
        String body = "{\"outcome\":\"rejected\"}";
        outcome(OWNER, id, UUID.randomUUID(), body)
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.error.code").value("ai_edit_not_found"));
        UUID otherPresentation = readyPresentation(OWNER);
        UUID elsewhere = insertEdit(OWNER, otherPresentation, "ok", Instant.now());
        outcome(OWNER, id, elsewhere, body).andExpect(status().isNotFound()).andExpect(jsonPath("$.error.code").value("ai_edit_not_found"));
        UUID foreignPresentation = readyPresentation(OTHER);
        UUID foreign = insertEdit(OTHER, foreignPresentation, "ok", Instant.now());
        outcome(OWNER, id, foreign, body).andExpect(status().isNotFound()).andExpect(jsonPath("$.error.code").value("ai_edit_not_found"));
        UUID running = insertEdit(OWNER, id, "running", Instant.now());
        outcome(OWNER, id, running, body).andExpect(status().isNotFound()).andExpect(jsonPath("$.error.code").value("ai_edit_not_found"));
        UUID cleared = insertEdit(OWNER, id, "ok", Instant.now());
        clear().andExpect(status().isNoContent());
        outcome(OWNER, id, cleared, body).andExpect(status().isNotFound()).andExpect(jsonPath("$.error.code").value("ai_edit_not_found"));
    }

    @Test
    void clearingRemovesTextsAndKeepsNumbersAndQuota() throws Exception {
        var request = custom(SECRET_REQUEST, fieldTarget(), SECRET_TEXT);
        JsonNode first = read(send(request).andExpect(status().isOk()));
        send(request("shorten", Map.of(), fieldTarget(), "Текст " + ScriptedTextEditLlm.FAIL)).andExpect(status().isBadGateway());
        UUID generation = insertCall("GENERATION");
        UUID chat = insertCall("CHAT");
        UUID foreign = readyPresentation(OWNER);
        JsonNode untouched = read(send(OWNER, foreign, custom("другая презентация", fieldTarget(), "Текст другой презентации")).andExpect(status().isOk()));
        int remaining = first.path("quota").path("remaining").asInt();

        clear().andExpect(status().isNoContent()).andExpect(header().string("Cache-Control", "no-store"));
        clear().andExpect(status().isNoContent());

        assertThat(read(history("")).path("items").size()).isZero();
        assertThat(db.queryForList("SELECT * FROM presentation_ai_edits WHERE presentation_id=?", id))
                .hasSize(2)
                .allSatisfy(row -> {
                    assertThat(row.get("params_json")).isEqualTo("{}");
                    assertThat(row.get("result_json")).isNull();
                    assertThat(row.get("cleared_at")).isNotNull();
                    assertThat(row.toString()).doesNotContain(SECRET_REQUEST, SECRET_TEXT);
                });
        assertThat(db.queryForObject("SELECT input_tokens FROM presentation_ai_edits WHERE id=?", Integer.class, UUID.fromString(first.path("edit_id").asText()))).isNotNull();
        assertThat(db.queryForList("SELECT id FROM presentation_ai_calls WHERE presentation_id=?", UUID.class, id))
                .containsExactlyInAnyOrder(generation, chat);
        assertThat(db.queryForList("SELECT * FROM presentation_ai_calls").toString()).doesNotContain(SECRET_REQUEST, SECRET_TEXT);
        assertThat(db.queryForObject("SELECT count(*) FROM presentation_ai_calls WHERE presentation_id=?", Integer.class, foreign)).isEqualTo(1);
        assertThat(read(history("").andExpect(status().isOk())).path("items").size()).isZero();
        assertThat(db.queryForObject("SELECT result_json FROM presentation_ai_edits WHERE id=?", String.class, UUID.fromString(untouched.path("edit_id").asText()))).isNotNull();

        send(request).andExpect(status().isBadGateway()).andExpect(jsonPath("$.error.code").value("ai_edit_failed"));
        var changed = new java.util.LinkedHashMap<>(request);
        changed.put("text", "Другой текст блока");
        send(changed).andExpect(status().isConflict()).andExpect(jsonPath("$.error.code").value("idempotency_conflict"));

        JsonNode next = read(send(custom("новая просьба", fieldTarget(), "Новый текст блока")).andExpect(status().isOk()));
        assertThat(next.path("quota").path("remaining").asInt()).isLessThan(remaining);
        assertThat(db.queryForObject("SELECT count(*) FROM presentation_ai_edits WHERE user_id=?", Integer.class, OWNER)).isEqualTo(4);
    }

    @Test
    void clearingLeavesARunningRequestToFinishAndAppear() throws Exception {
        CountDownLatch entered = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        doAnswer(
                        invocation -> {
                            // The audit record exists by the time the provider would be called.
                            Object result = invocation.callRealMethod();
                            entered.countDown();
                            assertThat(release.await(10, TimeUnit.SECONDS)).isTrue();
                            return result;
                        })
                .when(llm)
                .edit(any(TextEditPrompt.class));
        insertEdit(OWNER, id, "ok", Instant.now().minusSeconds(60));
        CompletableFuture<Integer> running =
                CompletableFuture.supplyAsync(
                        () -> {
                            try {
                                return send(custom("просьба в работе", fieldTarget(), "Текст в работе")).andReturn().getResponse().getStatus();
                            } catch (Exception failure) {
                                throw new IllegalStateException(failure);
                            }
                        });
        assertThat(entered.await(10, TimeUnit.SECONDS)).isTrue();
        // The stub finished its audit record inside the answer; reopen it to look like a call in flight.
        db.update("UPDATE presentation_ai_calls SET completed_at=NULL");

        clear().andExpect(status().isNoContent());

        var row = db.queryForMap("SELECT params_json, cleared_at FROM presentation_ai_edits WHERE status='running'");
        assertThat(row.get("cleared_at")).isNull();
        assertThat((String) row.get("params_json")).contains("просьба в работе");
        assertThat(db.queryForObject("SELECT count(*) FROM presentation_ai_calls", Integer.class)).isEqualTo(1);

        release.countDown();
        assertThat(running.get(20, TimeUnit.SECONDS)).isEqualTo(200);
        JsonNode items = read(history("")).path("items");
        assertThat(items.size()).isEqualTo(1);
        assertThat(items.get(0).path("instruction").asText()).isEqualTo("просьба в работе");
    }

    @Test
    void callsAreStillReportedByTheAuditRouteAfterClearing() throws Exception {
        send(custom("просьба", fieldTarget(), "Текст блока")).andExpect(status().isOk());
        assertThat(read(mvc.perform(get(CALLS, id).with(as(OWNER)))).path("items").size()).isEqualTo(1);
        clear().andExpect(status().isNoContent());
        assertThat(read(mvc.perform(get(CALLS, id).with(as(OWNER)))).path("items").size()).isZero();
    }

    @Test
    void clearingFailsStaleRunningRowsAndRemovesTheirTexts() throws Exception {
        UUID stale = insertEdit(OWNER, id, "running", Instant.now().minus(3, ChronoUnit.MINUTES));
        db.update("UPDATE presentation_ai_edits SET action='custom', params_json=? WHERE id=?", "{\"instruction\":\"" + SECRET_REQUEST + "\"}", stale);
        UUID fresh = insertEdit(OWNER, id, "running", Instant.now());
        UUID staleCall = insertOpenCall(Instant.now().minus(3, ChronoUnit.MINUTES));
        UUID freshCall = insertOpenCall(Instant.now());

        clear().andExpect(status().isNoContent());

        var row = db.queryForMap("SELECT * FROM presentation_ai_edits WHERE id=?", stale);
        assertThat(row.get("status")).isEqualTo("failed");
        assertThat(row.get("error_code")).isEqualTo("ai_edit_failed");
        assertThat(row.get("failure_reason")).isEqualTo("internal");
        assertThat(row.get("completed_at")).isNotNull();
        assertThat(row.get("params_json")).isEqualTo("{}");
        assertThat(row.get("cleared_at")).isNotNull();
        var running = db.queryForMap("SELECT status, cleared_at FROM presentation_ai_edits WHERE id=?", fresh);
        assertThat(running.get("status")).isEqualTo("running");
        assertThat(running.get("cleared_at")).isNull();
        assertThat(db.queryForList("SELECT id FROM presentation_ai_calls", UUID.class)).containsExactly(freshCall).doesNotContain(staleCall);
    }

    @Test
    void lateCompletionCannotBringClearedTextsBack() throws Exception {
        CountDownLatch entered = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        doAnswer(
                        invocation -> {
                            Object result = invocation.callRealMethod();
                            entered.countDown();
                            assertThat(release.await(10, TimeUnit.SECONDS)).isTrue();
                            return result;
                        })
                .when(llm)
                .edit(any(TextEditPrompt.class));
        CompletableFuture<Integer> late =
                CompletableFuture.supplyAsync(
                        () -> {
                            try {
                                return send(custom(SECRET_REQUEST, fieldTarget(), SECRET_TEXT)).andReturn().getResponse().getStatus();
                            } catch (Exception failure) {
                                throw new IllegalStateException(failure);
                            }
                        });
        assertThat(entered.await(10, TimeUnit.SECONDS)).isTrue();
        db.update("UPDATE presentation_ai_edits SET created_at = created_at - interval '3 minutes'");
        clear().andExpect(status().isNoContent());
        release.countDown();
        assertThat(late.get(20, TimeUnit.SECONDS)).isEqualTo(502);
        var row = db.queryForMap("SELECT status, params_json, result_json FROM presentation_ai_edits");
        assertThat(row.get("status")).isEqualTo("failed");
        assertThat(row.get("params_json")).isEqualTo("{}");
        assertThat(row.get("result_json")).isNull();
    }

    @Test
    void failureWhileBuildingTheProposalDoesNotLeaveARunningRow() throws Exception {
        doThrow(new IllegalStateException("boom")).when(factGuard).known(any());
        send(custom(SECRET_REQUEST, fieldTarget(), SECRET_TEXT))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.error.code").value("ai_edit_failed"));
        var row = db.queryForMap("SELECT status, failure_reason, input_tokens FROM presentation_ai_edits");
        assertThat(row.get("status")).isEqualTo("failed");
        assertThat(row.get("failure_reason")).isEqualTo("internal");
        assertThat(row.get("input_tokens")).isNotNull();
    }

    @Test
    void inventedStatisticInTheMessageIsReplacedAndRecorded() throws Exception {
        JsonNode response = read(send(custom("что улучшить " + ScriptedTextEditLlm.BAD_MESSAGE, fieldTarget(), "Текст блока")).andExpect(status().isOk()));
        assertThat(response.path("status").asText()).isEqualTo("alternative");
        assertThat(response.path("reason").asText()).isEqualTo("advice");
        assertThat(response.path("message").asText()).isEqualTo("Могу предложить правку этого текста.");
        assertThat(journal(response).get("fact_guard")).isEqualTo("blocked");
    }

    @Test
    void droppedSuggestionIsRecordedAsBlocked() throws Exception {
        JsonNode response = read(send(custom("что улучшить " + ScriptedTextEditLlm.BAD_SUGGESTION, fieldTarget(), "Текст блока")).andExpect(status().isOk()));
        assertThat(response.path("message").asText()).isEqualTo("Текст можно сократить.");
        assertThat(response.path("suggestions").toString()).contains("Сократи текст").doesNotContain("37");
        assertThat(journal(response).get("fact_guard")).isEqualTo("blocked");
    }

    @Test
    void wholeVariantInQuotesIsCheckedBeforeTheSanitizerRemovesThem() throws Exception {
        JsonNode response = read(send(custom("добавь цитату " + ScriptedTextEditLlm.FRAMED_QUOTE, fieldTarget(), "Текст блока")).andExpect(status().isOk()));
        assertThat(response.path("status").asText()).isEqualTo("alternative");
        assertThat(response.path("reason").asText()).isEqualTo("needs_source");
        assertThat(journal(response).get("fact_guard")).isEqualTo("blocked");
    }

    @Test
    void okTelemetryIsComplete() throws Exception {
        var request = custom(SECRET_REQUEST, fieldTarget(), SECRET_TEXT);
        request.put("variants", 2);
        var row = journal(read(send(request).andExpect(status().isOk())));
        assertThat(row.get("prompt_version")).isEqualTo("text-edit-v2");
        assertThat(row.get("duration_ms")).isNotNull();
        assertThat(row.get("max_output_tokens")).isEqualTo(1024 + 2 * ((max + 1) / 2));
        assertThat(row.get("instruction_length")).isEqualTo(SECRET_REQUEST.length());
        assertThat(row.get("fact_guard")).isEqualTo("none");
        assertThat(row.get("alternative_reason")).isNull();
        assertThat(row.get("failure_reason")).isNull();
        assertThat(row.get("incomplete_reason")).isNull();
        assertThat(row.get("input_tokens")).isNotNull();
        assertNoUserTextInNewColumns();
    }

    @Test
    void quickActionHasNoInstructionLength() throws Exception {
        var row = journal(read(send(request("shorten", Map.of(), fieldTarget(), "Мы делаем презентации быстро")).andExpect(status().isOk())));
        assertThat(row.get("instruction_length")).isNull();
    }

    @Test
    void alternativeTelemetryKeepsTheReason() throws Exception {
        var row = journal(read(send(custom(SECRET_REQUEST + " " + ScriptedTextEditLlm.ALT_STYLE, fieldTarget(), SECRET_TEXT)).andExpect(status().isOk())));
        assertThat(row.get("status")).isEqualTo("alternative");
        assertThat(row.get("alternative_reason")).isEqualTo("style_panel");
        assertThat(row.get("fact_guard")).isEqualTo("none");
        assertNoUserTextInNewColumns();
    }

    @Test
    void blockedAnswerIsAnAlternativeWithTheGuardRecorded() throws Exception {
        JsonNode response = read(send(custom("добавь цитату главного инженера Subaru " + ScriptedTextEditLlm.FAKE_QUOTE, fieldTarget(), "Текст блока")).andExpect(status().isOk()));
        assertThat(response.path("status").asText()).isEqualTo("alternative");
        assertThat(response.path("reason").asText()).isEqualTo("needs_source");
        assertThat(response.path("variants").size()).isZero();
        assertThat(response.path("suggestions").toString()).contains("[Цитата: имя, источник]");
        var row = journal(response);
        assertThat(row.get("fact_guard")).isEqualTo("blocked");
        assertThat(row.get("alternative_reason")).isEqualTo("needs_source");
        assertThat(row.get("result_json").toString()).doesNotContain("Оппозитный");
    }

    @Test
    void incompleteAnswerRecordsTokensAndReason() throws Exception {
        send(custom(SECRET_REQUEST + " " + ScriptedTextEditLlm.INCOMPLETE, fieldTarget(), SECRET_TEXT))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.error.code").value("ai_edit_failed"));
        var row = db.queryForMap("SELECT * FROM presentation_ai_edits");
        assertThat(row.get("status")).isEqualTo("failed");
        assertThat(row.get("error_code")).isEqualTo("ai_edit_failed");
        assertThat(row.get("failure_reason")).isEqualTo("max_output");
        assertThat(row.get("incomplete_reason")).isEqualTo("max_output_tokens");
        assertThat(row.get("reasoning_tokens")).isEqualTo(ScriptedTextEditLlm.INCOMPLETE_REASONING_TOKENS);
        assertThat(row.get("input_tokens")).isNotNull();
        assertThat(row.get("duration_ms")).isNotNull();
        var call = db.queryForMap("SELECT http_status, error_code, reasoning_tokens FROM presentation_ai_calls");
        assertThat(call.get("http_status")).isEqualTo(200);
        assertThat(call.get("error_code")).isEqualTo("ai_edit_failed");
        assertThat(call.get("reasoning_tokens")).isEqualTo(ScriptedTextEditLlm.INCOMPLETE_REASONING_TOKENS);
        assertNoUserTextInNewColumns();
    }

    @Test
    void providerFailureHasItsReason() throws Exception {
        send(request("shorten", Map.of(), fieldTarget(), "Текст " + ScriptedTextEditLlm.FAIL)).andExpect(status().isBadGateway());
        var row = db.queryForMap("SELECT failure_reason, incomplete_reason, prompt_version FROM presentation_ai_edits");
        assertThat(row.get("failure_reason")).isEqualTo("provider_http");
        assertThat(row.get("incomplete_reason")).isNull();
        assertThat(row.get("prompt_version")).isEqualTo("text-edit-v2");
    }

    @Test
    void unexpectedFailureIsInternal() throws Exception {
        doThrow(new IllegalStateException("boom")).when(llm).edit(any(TextEditPrompt.class));
        send(request("shorten", Map.of(), fieldTarget(), "Текст блока")).andExpect(status().isBadGateway());
        assertThat(db.queryForObject("SELECT failure_reason FROM presentation_ai_edits", String.class)).isEqualTo("internal");
    }

    @Test
    void staleRunningEditIsInternal() throws Exception {
        var request = request("rephrase", Map.of(), fieldTarget(), "Раз два три четыре");
        send(request).andExpect(status().isOk());
        db.update("UPDATE presentation_ai_edits SET status='running', result_json=NULL, completed_at=NULL,"
                + " created_at = created_at - interval '3 minutes'");
        send(request).andExpect(status().isBadGateway());
        assertThat(db.queryForObject("SELECT failure_reason FROM presentation_ai_edits", String.class)).isEqualTo("internal");
    }

    @Test
    void logsCarryCodesButNoUserText(CapturedOutput output) throws Exception {
        send(custom(SECRET_REQUEST, fieldTarget(), SECRET_TEXT)).andExpect(status().isOk());
        send(custom(SECRET_REQUEST + " " + ScriptedTextEditLlm.ALT_SOURCE, fieldTarget(), SECRET_TEXT)).andExpect(status().isOk());
        send(custom(SECRET_REQUEST + " " + ScriptedTextEditLlm.INCOMPLETE, fieldTarget(), SECRET_TEXT)).andExpect(status().isBadGateway());
        assertThat(output.getAll())
                .contains("promptVersion=text-edit-v2", "reason=needs_source", "failureReason=max_output", "factGuard=none", "maxOutputTokens=")
                .doesNotContain(SECRET_REQUEST, SECRET_TEXT, "Подлинную цитату");
    }

    // ---- helpers ----

    private String edit(Map<String, Object> request) throws Exception {
        return read(send(request).andExpect(status().isOk())).path("edit_id").asText();
    }

    private ResultActions history(String query) throws Exception {
        return mvc.perform(get(HISTORY + query, id).with(as(OWNER)));
    }

    private ResultActions outcome(UUID user, UUID presentation, UUID edit, String body) throws Exception {
        return mvc.perform(post(OUTCOME, presentation, edit).with(as(user)).with(csrf()).contentType("application/json").content(body));
    }

    private ResultActions clear() throws Exception {
        return mvc.perform(delete(HISTORY, id).with(as(OWNER)).with(csrf()));
    }

    private int callCount() {
        return db.queryForObject("SELECT count(*) FROM presentation_ai_calls", Integer.class);
    }

    private Map<String, Object> journal(JsonNode response) {
        return db.queryForMap("SELECT * FROM presentation_ai_edits WHERE id=?", UUID.fromString(response.path("edit_id").asText()));
    }

    private void assertNoUserTextInNewColumns() {
        assertThat(
                        db.queryForObject(
                                "SELECT count(*) FROM presentation_ai_edits WHERE concat_ws(' ', prompt_version, alternative_reason,"
                                        + " failure_reason, incomplete_reason, fact_guard, outcome, error_code) ~ ?",
                                Integer.class,
                                SECRET_REQUEST + "|" + SECRET_TEXT))
                .isZero();
    }

    private UUID insertEdit(UUID user, UUID presentation, String status, Instant createdAt) {
        UUID editId = UUID.randomUUID();
        db.update(
                "INSERT INTO presentation_ai_edits (id, presentation_id, user_id, kind, request_id, request_hash,"
                        + " action, params_json, target_kind, target_ref, source_length, status, model, created_at)"
                        + " VALUES (?, ?, ?, 'TEXT_EDIT', ?, ?, 'shorten', '{}', 'template_field', 'slide-1/TITLE', 5, ?,"
                        + " 'gpt-5.4-mini', ?)",
                editId,
                presentation,
                user,
                UUID.randomUUID(),
                "0".repeat(64),
                status,
                Timestamp.from(createdAt));
        return editId;
    }

    private UUID insertOpenCall(Instant startedAt) {
        UUID callId = UUID.randomUUID();
        db.update(
                "INSERT INTO presentation_ai_calls (id, presentation_id, operation, model, request_body, started_at)"
                        + " VALUES (?, ?, 'TEXT_EDIT', 'gpt-5.4-mini', '{}', ?)",
                callId,
                id,
                Timestamp.from(startedAt));
        return callId;
    }

    private UUID insertCall(String operation) {
        UUID callId = UUID.randomUUID();
        db.update(
                "INSERT INTO presentation_ai_calls (id, presentation_id, operation, model, request_body, started_at, completed_at)"
                        + " VALUES (?, ?, ?, 'gpt-5.4-mini', '{}', now(), now())",
                callId,
                id,
                operation);
        return callId;
    }

}
