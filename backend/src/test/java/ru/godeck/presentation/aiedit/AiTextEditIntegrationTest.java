package ru.godeck.presentation.aiedit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import static java.nio.charset.StandardCharsets.UTF_8;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import ru.godeck.auth.security.AuthPrincipal;
import ru.godeck.common.security.SecurityPolicy;
import ru.godeck.presentation.aiedit.ai.ScriptedTextEditLlm;
import ru.godeck.presentation.aiedit.ai.TextEditPrompt;
import ru.godeck.presentation.aiedit.service.AiEditRetention;
import ru.godeck.presentation.model.PresentationContent;
import ru.godeck.presentation.service.PresentationService;
import ru.godeck.presentation.template.PresentationTemplateService;
import ru.godeck.presentation.worker.PresentationWorker;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.stream.Stream;

/**
 * AI text edits over HTTP: real Spring Security (session principal, CSRF), PostgreSQL and the
 * deterministic {@link ScriptedTextEditLlm}. No request reaches OpenAI.
 */
@SpringBootTest(
        properties = {
            "godeck.auth.dev-bypass=false",
            "godeck.generation.enabled=false",
            "godeck.generation.poll-ms=86400000",
            "godeck.ai-edit.llm=scripted",
            "spring.datasource.hikari.schema=ai_edit_test",
            "spring.flyway.default-schema=ai_edit_test",
            "spring.flyway.schemas=ai_edit_test"
        })
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AiTextEditIntegrationTest {
    static final String TEMPLATE = "atlas";
    static final String BLOCK = "note-1";
    static final UUID OWNER = UUID.randomUUID();
    static final UUID OTHER = UUID.randomUUID();
    static final Path OUTPUT =
            Path.of(System.getProperty("java.io.tmpdir"), "godeck-ai-edit-test-" + UUID.randomUUID());
    static final String TEXTS = "/api/generation/v1/presentations/{id}/editor/ai/text-edits";
    static final String ACTIONS = "/api/generation/v1/editor/ai/actions";

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate db;
    @Autowired ObjectMapper json;
    @Autowired PresentationTemplateService templates;
    @Autowired PresentationService service;
    @Autowired PresentationWorker worker;
    @Autowired AiEditRetention retention;
    @MockitoSpyBean ScriptedTextEditLlm llm;

    String field;
    int max;
    UUID id;

    @DynamicPropertySource
    static void configuration(DynamicPropertyRegistry properties) {
        String database =
                System.getenv()
                        .getOrDefault(
                                "TEST_DATABASE_URL",
                                "jdbc:postgresql://127.0.0.1:5433/godeck?currentSchema=auth_test");
        properties.add(
                "spring.datasource.url",
                () -> database.replace("currentSchema=auth_test", "currentSchema=ai_edit_test"));
        properties.add("godeck.generation.data-dir", OUTPUT::toString);
    }

    @BeforeEach
    void setUp() {
        db.update("DELETE FROM generated_presentations");
        db.update("DELETE FROM app_users");
        for (UUID user : List.of(OWNER, OTHER))
            db.update(
                    "INSERT INTO app_users (id, email, password_hash, consent_at, created_at)"
                            + " VALUES (?, ?, 'x', now(), now())",
                    user,
                    user + "@example.test");
        field = slideOneField();
        max = templates.fields(TEMPLATE).get(field);
        id = readyPresentation(OWNER);
    }

    @AfterAll
    static void cleanFiles() throws Exception {
        if (Files.exists(OUTPUT))
            try (var files = Files.walk(OUTPUT)) {
                for (Path file : files.sorted(java.util.Comparator.reverseOrder()).toList())
                    Files.deleteIfExists(file);
            }
    }

    @Test
    void catalogMatchesTheContractAndReportsDisabledAi() throws Exception {
        String body =
                mvc.perform(get(ACTIONS).with(as(OWNER)))
                        .andExpect(status().isOk())
                        .andExpect(header().string("Cache-Control", "no-store"))
                        .andReturn()
                        .getResponse()
                        .getContentAsString(UTF_8);
        try (var snapshot =
                getClass().getClassLoader().getResourceAsStream("golden/ai-edit-actions.json")) {
            assertThat(json.readTree(body)).isEqualTo(json.readTree(snapshot.readAllBytes()));
        }
        doReturn(false).when(llm).enabled();
        mvc.perform(get(ACTIONS).with(as(OWNER)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.enabled").value(false))
                .andExpect(jsonPath("$.actions.length()").value(3));
        mvc.perform(post(TEXTS, id).with(as(OWNER)).with(csrf()).contentType("application/json")
                        .content(body(request("shorten", Map.of(), fieldTarget(), "Короткий текст для правки"))))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.error.code").value("openai_disabled"));
        verify(llm, never()).edit(any());
    }

    @Test
    void fieldEditReturnsAProposalAndDoesNotTouchTheDocument() throws Exception {
        Map<String, Object> before = documentState(id);
        assertThat(before).containsEntry("status", "draft").containsEntry("current_version", 0);
        List<Path> filesBefore = files();
        String source = "Мы делаем презентации быстро и без лишней головной боли";
        JsonNode response =
                ok(request("shorten", Map.of(), fieldTarget(), source))
                        .andExpect(header().string("Cache-Control", "no-store"))
                        .andExpect(jsonPath("$.status").value("ok"))
                        .andExpect(jsonPath("$.message").doesNotExist())
                        .andExpect(jsonPath("$.action").value("shorten"))
                        .andExpect(jsonPath("$.target.kind").value("template_field"))
                        .andExpect(jsonPath("$.target.field_key").value(field))
                        .andExpect(jsonPath("$.source_text").value(source))
                        .andExpect(jsonPath("$.max_chars").value(max))
                        .andExpect(jsonPath("$.hard_max_chars").value(Math.min(4000, Math.max(2 * max, max + 100))))
                        .andExpect(jsonPath("$.model").value("gpt-5.4-mini"))
                        .andExpect(jsonPath("$.usage.input_tokens").isNumber())
                        .andExpect(jsonPath("$.usage.output_tokens").isNumber())
                        .andExpect(jsonPath("$.quota.limit").value(100))
                        .andExpect(jsonPath("$.quota.remaining").value(99))
                        .andExpect(jsonPath("$.quota.resets_at").isString())
                        .andExpect(jsonPath("$.replayed").value(false))
                        .andReturn()
                        .getResponse()
                        .getContentAsString(UTF_8)
                        .transform(json::readTree);
        JsonNode variant = response.path("variants").get(0);
        assertThat(variant.path("text").asText()).isEqualTo("Мы делаем презентации быстро");
        assertThat(variant.path("length").asInt()).isEqualTo(variant.path("text").asText().length());
        assertThat(variant.path("over_by").asInt()).isZero();
        assertThat(variant.path("warnings").size()).isZero();

        UUID editId = UUID.fromString(response.path("edit_id").asText());
        var edit = db.queryForMap("SELECT * FROM presentation_ai_edits WHERE id=?", editId);
        assertThat(edit.get("status")).isEqualTo("ok");
        assertThat(edit.get("kind")).isEqualTo("TEXT_EDIT");
        assertThat(edit.get("target_kind")).isEqualTo("template_field");
        assertThat(edit.get("target_ref")).isEqualTo("slide-1/" + field);
        assertThat(edit.get("source_length")).isEqualTo(source.length());
        assertThat(edit.get("input_tokens")).isNotNull();
        assertThat(edit.get("result_json")).isNotNull();
        var call = db.queryForMap("SELECT * FROM presentation_ai_calls WHERE presentation_id=?", id);
        assertThat(call.get("operation")).isEqualTo("TEXT_EDIT");
        assertThat(call.get("input_tokens")).isNotNull();
        assertThat(call.get("output_tokens")).isNotNull();
        assertThat(call.get("http_status")).isEqualTo(200);

        JsonNode sent = json.readTree((String) call.get("request_body"));
        assertThat(List.copyOf(sent.propertyNames()))
                .containsExactly("model", "instructions", "input", "text", "max_output_tokens", "store", "reasoning");
        JsonNode input = json.readTree(sent.path("input").asText());
        assertThat(List.copyOf(input.propertyNames()))
                .containsExactly("task", "max_chars", "role", "deck_title", "slide_title", "request", "variants", "text");
        assertThat(input.path("max_chars").asInt()).isEqualTo(max);
        assertThat(input.path("text").asText()).isEqualTo(source);
        assertThat(input.path("deck_title").asText()).isEqualTo("GoDeck для отделов продаж");
        assertThat(sent.path("store").asBoolean(true)).isFalse();
        assertThat(sent.toString()).doesNotContain("Тема презентации", "Другое поле", "Заметка");
        assertThat(documentState(id)).isEqualTo(before);
        assertThat(files()).isEqualTo(filesBefore);
        verify(llm, times(1)).edit(any());
    }

    @Test
    void customBlockEditUsesBlockLimits() throws Exception {
        ok(request("rephrase", Map.of(), blockTarget(), "Заметка докладчика о главном"))
                .andExpect(jsonPath("$.status").value("ok"))
                .andExpect(jsonPath("$.target.block_id").value(BLOCK))
                .andExpect(jsonPath("$.max_chars").value(4000))
                .andExpect(jsonPath("$.hard_max_chars").value(4000))
                .andExpect(jsonPath("$.variants[0].text").value("главном о докладчика Заметка"));
    }

    @Test
    void refinementSendsOnlyTheProposalAndTheRequest() throws Exception {
        String original = "Первое длинное исходное предложение про продажи и команды";
        JsonNode first = read(ok(request("rephrase", Map.of(), fieldTarget(), original)));
        String proposal = first.path("variants").get(0).path("text").asText();
        String editId = first.path("edit_id").asText();
        var refine = request("custom", Map.of("instruction", "ещё короче"), fieldTarget(), proposal);
        refine.put("refines_edit_id", editId);
        ok(refine).andExpect(jsonPath("$.refines_edit_id").value(editId));
        assertThat(db.queryForObject("SELECT count(*) FROM presentation_ai_edits WHERE refines_edit_id=?", Integer.class, UUID.fromString(editId)))
                .isEqualTo(1);
        String lastRequest =
                db.queryForObject(
                        "SELECT request_body FROM presentation_ai_calls ORDER BY started_at DESC LIMIT 1", String.class);
        JsonNode input = json.readTree(json.readTree(lastRequest).path("input").asText());
        assertThat(input.path("text").asText()).isEqualTo(proposal);
        assertThat(input.path("request").asText()).isEqualTo("ещё короче");
        assertThat(lastRequest).doesNotContain(original);

        var unknown = request("custom", Map.of("instruction", "ещё"), fieldTarget(), proposal);
        unknown.put("refines_edit_id", UUID.randomUUID().toString());
        error(unknown, 422, "invalid_input");
        UUID foreignPresentation = readyPresentation(OTHER);
        String foreignEdit =
                read(perform(OTHER, foreignPresentation, request("shorten", Map.of(), fieldTarget(), "Чужой текст правки")).andExpect(status().isOk()))
                        .path("edit_id").asText();
        var foreign = request("custom", Map.of("instruction", "ещё"), fieldTarget(), proposal);
        foreign.put("refines_edit_id", foreignEdit);
        error(foreign, 422, "invalid_input");

        int hard = Math.min(4000, Math.max(2 * max, max + 100));
        ok(request("rephrase", Map.of(), fieldTarget(), "слово ".repeat(hard).substring(0, hard - 1) + "я"))
                .andExpect(jsonPath("$.source_text").isString());
    }

    @Test
    void longResultIsReturnedInFullWithOneModelCall() throws Exception {
        ok(request("custom", Map.of("instruction", "сделай длиннее"), fieldTarget(), "Текст " + ScriptedTextEditLlm.LONG))
                .andExpect(jsonPath("$.status").value("ok"))
                .andExpect(jsonPath("$.variants[0].length").value(max + 13))
                .andExpect(jsonPath("$.variants[0].over_by").value(13))
                .andExpect(jsonPath("$.variants[0].warnings[0]").value("over_limit"))
                .andExpect(jsonPath("$.variants[0].warnings.length()").value(1));
        verify(llm, times(1)).edit(any());
        int hard = Math.min(4000, Math.max(2 * max, max + 100));
        ok(request("custom", Map.of("instruction", "ещё длиннее"), fieldTarget(), "Текст " + ScriptedTextEditLlm.HUGE))
                .andExpect(jsonPath("$.variants[0].length").value(hard + 20))
                .andExpect(jsonPath("$.variants[0].warnings[1]").value("exceeds_hard_limit"));
        verify(llm, times(2)).edit(any());
    }

    @Test
    void outOfScopeRequestIsUnsupported() throws Exception {
        ok(request("custom", Map.of("instruction", "добавь слайд про цены"), fieldTarget(), "Текст поля"))
                .andExpect(jsonPath("$.status").value("unsupported"))
                .andExpect(jsonPath("$.variants.length()").value(0))
                .andExpect(jsonPath("$.message").value("Я могу менять только текст выбранного блока."));
        assertThat(db.queryForObject("SELECT status FROM presentation_ai_edits", String.class)).isEqualTo("unsupported");
    }

    @Test
    void sameTextIsUnchanged() throws Exception {
        ok(request("rephrase", Map.of(), fieldTarget(), "Слово"))
                .andExpect(jsonPath("$.status").value("unchanged"))
                .andExpect(jsonPath("$.variants.length()").value(0))
                .andExpect(jsonPath("$.message").isString());
    }

    @Test
    void accessRequiresOwnershipSessionCsrfAndAReadyPresentation() throws Exception {
        String body = body(request("shorten", Map.of(), fieldTarget(), "Текст поля для проверки"));
        mvc.perform(post(TEXTS, id).with(as(OTHER)).with(csrf()).contentType("application/json").content(body))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("presentation_not_found"));
        mvc.perform(post(TEXTS, UUID.randomUUID()).with(as(OWNER)).with(csrf()).contentType("application/json").content(body))
                .andExpect(status().isNotFound());
        mvc.perform(post(TEXTS, id).with(csrf()).contentType("application/json").content(body))
                .andExpect(status().isUnauthorized());
        mvc.perform(get(ACTIONS)).andExpect(status().isUnauthorized());
        mvc.perform(post(TEXTS, id).with(as(OWNER)).contentType("application/json").content(body))
                .andExpect(status().isForbidden());
        UUID waiting = service.create(OWNER, TEMPLATE, "Ещё не готова", "manual", null, null, null, null, null).id();
        mvc.perform(post(TEXTS, waiting).with(as(OWNER)).with(csrf()).contentType("application/json").content(body))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("presentation_not_ready"));
        verify(llm, never()).edit(any());
        assertThat(db.queryForObject("SELECT count(*) FROM presentation_ai_edits", Integer.class)).isZero();
    }

    @Test
    void everyInputErrorIsReportedWithoutCallingTheModel() throws Exception {
        String text = "Нормальный текст поля";
        var missingId = request("shorten", Map.of(), fieldTarget(), text);
        missingId.remove("request_id");
        error(missingId, 422, "invalid_input");
        var notUuid = request("shorten", Map.of(), fieldTarget(), text);
        notUuid.put("request_id", "not-a-uuid");
        error(notUuid, 422, "invalid_input");
        for (int variants : List.of(0, 4)) {
            var range = request("shorten", Map.of(), fieldTarget(), text);
            range.put("variants", variants);
            error(range, 422, "invalid_input");
        }
        var mixed = fieldTarget();
        mixed.put("block_id", BLOCK);
        error(request("shorten", Map.of(), mixed, text), 422, "invalid_input");
        var blockWithoutId = blockTarget();
        blockWithoutId.put("block_id", null);
        error(request("shorten", Map.of(), blockWithoutId, text), 422, "invalid_input");
        var badKind = fieldTarget();
        badKind.put("kind", "slide");
        error(request("shorten", Map.of(), badKind, text), 422, "invalid_input");
        var noText = request("shorten", Map.of(), fieldTarget(), text);
        noText.remove("text");
        error(noText, 422, "invalid_input");

        error(request("change_tone", Map.of(), fieldTarget(), text), 422, "unsupported_action");
        error(request("custom", Map.of(), fieldTarget(), text), 422, "invalid_params");
        error(request("custom", Map.of("instruction", "а".repeat(301)), fieldTarget(), text), 422, "invalid_params");
        error(request("shorten", Map.of("tone", "formal"), fieldTarget(), text), 422, "invalid_params");

        var excluded = fieldTarget();
        excluded.put("slide_id", "slide-2");
        error(request("shorten", Map.of(), excluded, text), 422, "invalid_target");
        var malformedSlide = fieldTarget();
        malformedSlide.put("slide_id", "3");
        error(request("shorten", Map.of(), malformedSlide, text), 422, "invalid_target");
        var wrongField = fieldTarget();
        wrongField.put("field_key", foreignField());
        error(request("shorten", Map.of(), wrongField, text), 422, "invalid_target");
        var missingBlock = blockTarget();
        missingBlock.put("block_id", "unsaved-block");
        error(request("shorten", Map.of(), missingBlock, text), 422, "invalid_target");

        error(request("shorten", Map.of(), fieldTarget(), "   "), 422, "invalid_text");
        error(request("shorten", Map.of(), fieldTarget(), "Текст {{TITLE}}"), 422, "invalid_text");
        int hard = Math.min(4000, Math.max(2 * max, max + 100));
        error(request("shorten", Map.of(), fieldTarget(), "а".repeat(hard + 1)), 422, "text_too_long");
        error(request("shorten", Map.of(), blockTarget(), "а".repeat(2001)), 422, "text_too_long");
        var model = request("shorten", Map.of(), fieldTarget(), text);
        model.put("model", "gpt-unknown");
        error(model, 422, "unsupported_model");

        verify(llm, never()).edit(any());
        assertThat(db.queryForObject("SELECT count(*) FROM presentation_ai_edits", Integer.class)).isZero();
    }

    @Test
    void dailyQuotaStopsTheHundredAndFirstEditWithoutAModelCall() throws Exception {
        Instant now = Instant.now();
        for (int i = 0; i < 100; i++)
            insertEdit(OWNER, id, "ok", now.minus(i, ChronoUnit.MINUTES));
        String message =
                read(perform(OWNER, id, request("shorten", Map.of(), fieldTarget(), "Текст поля"))
                                .andExpect(status().isTooManyRequests())
                                .andExpect(jsonPath("$.error.code").value("ai_edit_limit")))
                        .path("error").path("message").asText();
        Instant resetsAt = now.minus(99, ChronoUnit.MINUTES).plus(24, ChronoUnit.HOURS).truncatedTo(ChronoUnit.SECONDS);
        assertThat(message).contains("МСК").contains(resetsAt.toString().substring(0, 16));
        verify(llm, never()).edit(any());
        db.update("UPDATE presentation_ai_edits SET created_at = created_at - interval '25 hours'");
        ok(request("shorten", Map.of(), fieldTarget(), "Текст поля после окна"))
                .andExpect(jsonPath("$.quota.remaining").value(99));
    }

    @Test
    void repeatedRequestIsReplayedAndAnotherBodyConflicts() throws Exception {
        var first = request("rephrase", Map.of(), fieldTarget(), "Один два три");
        JsonNode original = read(ok(first));
        JsonNode replay = read(ok(first).andExpect(jsonPath("$.replayed").value(true)));
        assertThat(replay.path("edit_id")).isEqualTo(original.path("edit_id"));
        assertThat(replay.path("variants")).isEqualTo(original.path("variants"));
        assertThat(replay.path("quota")).isEqualTo(original.path("quota"));
        verify(llm, times(1)).edit(any());
        assertThat(db.queryForObject("SELECT count(*) FROM presentation_ai_edits", Integer.class)).isEqualTo(1);
        var changed = new LinkedHashMap<>(first);
        changed.put("text", "Совсем другой текст");
        error(changed, 409, "idempotency_conflict");
    }

    @Test
    void concurrentDuplicateMakesOneModelCallAndEditorKeepsWorking() throws Exception {
        CountDownLatch entered = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        AtomicBoolean transactionDuringCall = new AtomicBoolean(true);
        doAnswer(
                        invocation -> {
                            transactionDuringCall.set(TransactionSynchronizationManager.isActualTransactionActive());
                            entered.countDown();
                            assertThat(release.await(10, TimeUnit.SECONDS)).isTrue();
                            return invocation.callRealMethod();
                        })
                .when(llm)
                .edit(any(TextEditPrompt.class));
        var request = request("rephrase", Map.of(), fieldTarget(), "Альфа бета гамма");
        CompletableFuture<Integer> first =
                CompletableFuture.supplyAsync(
                        () -> {
                            try {
                                return perform(OWNER, id, request).andReturn().getResponse().getStatus();
                            } catch (Exception failure) {
                                throw new IllegalStateException(failure);
                            }
                        });
        assertThat(entered.await(10, TimeUnit.SECONDS)).isTrue();
        error(request, 409, "ai_edit_in_progress");

        // The edit takes no lease: autosave and export work while the model is running.
        JsonNode editor = editor();
        mvc.perform(put("/api/generation/v1/presentations/{id}/editor/draft", id).with(as(OWNER)).with(csrf())
                        .contentType("application/json").content(draft(editor)))
                .andExpect(status().isOk());
        mvc.perform(post("/api/generation/v1/presentations/{id}/editor/commit", id).with(as(OWNER)).with(csrf())
                        .contentType("application/json").content("{\"base_version\":0,\"draft_revision\":1}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.version").value(1));

        release.countDown();
        assertThat(first.get(20, TimeUnit.SECONDS)).isEqualTo(200);
        assertThat(transactionDuringCall.get()).isFalse();
        verify(llm, times(1)).edit(any());
        ok(request).andExpect(jsonPath("$.replayed").value(true));
        verify(llm, times(1)).edit(any());
    }

    @Test
    void staleRunningEditBecomesFailed() throws Exception {
        var request = request("rephrase", Map.of(), fieldTarget(), "Раз два три четыре");
        ok(request);
        db.update("UPDATE presentation_ai_edits SET status='running', result_json=NULL, completed_at=NULL");
        error(request, 409, "ai_edit_in_progress");
        db.update("UPDATE presentation_ai_edits SET created_at = created_at - interval '3 minutes'");
        error(request, 502, "ai_edit_failed");
        assertThat(db.queryForObject("SELECT status FROM presentation_ai_edits", String.class)).isEqualTo("failed");
        error(request, 502, "ai_edit_failed");
        verify(llm, times(1)).edit(any());
    }

    @Test
    void providerFailureIsRecordedAndANewRequestStillWorks() throws Exception {
        Map<String, Object> before = documentState(id);
        var failing = request("shorten", Map.of(), fieldTarget(), "Текст " + ScriptedTextEditLlm.FAIL);
        error(failing, 502, "ai_edit_failed");
        var edit = db.queryForMap("SELECT status, error_code FROM presentation_ai_edits");
        assertThat(edit.get("status")).isEqualTo("failed");
        assertThat(edit.get("error_code")).isEqualTo("ai_edit_failed");
        var call = db.queryForMap("SELECT operation, http_status, error_code FROM presentation_ai_calls");
        assertThat(call.get("operation")).isEqualTo("TEXT_EDIT");
        assertThat(call.get("http_status")).isEqualTo(500);
        assertThat(call.get("error_code")).isEqualTo("ai_edit_failed");
        error(failing, 502, "ai_edit_failed");
        verify(llm, times(1)).edit(any());
        ok(request("shorten", Map.of(), fieldTarget(), "Новый запрос после ошибки")).andExpect(jsonPath("$.status").value("ok"));
        assertThat(documentState(id)).isEqualTo(before);
    }

    @Test
    void retentionRemovesOnlyOldTextEditRecords() throws Exception {
        Instant old = Instant.now().minus(91, ChronoUnit.DAYS);
        Instant recent = Instant.now().minus(89, ChronoUnit.DAYS);
        UUID oldEdit = insertEdit(OWNER, id, "ok", old);
        UUID recentEdit = insertEdit(OWNER, id, "ok", recent);
        db.update("UPDATE presentation_ai_edits SET refines_edit_id=? WHERE id=?", oldEdit, recentEdit);
        UUID oldTextCall = insertCall("TEXT_EDIT", old);
        UUID recentTextCall = insertCall("TEXT_EDIT", recent);
        UUID oldGeneration = insertCall("GENERATION", old);
        UUID oldChat = insertCall("CHAT", old);

        assertThat(retention.purge()).isEqualTo(2);

        assertThat(ids("presentation_ai_edits")).containsExactly(recentEdit);
        assertThat(db.queryForObject("SELECT refines_edit_id FROM presentation_ai_edits", UUID.class)).isNull();
        assertThat(ids("presentation_ai_calls"))
                .containsExactlyInAnyOrder(recentTextCall, oldGeneration, oldChat)
                .doesNotContain(oldTextCall);
    }

    // ---- helpers ----

    private ResultActions ok(Map<String, Object> request) throws Exception {
        return perform(OWNER, id, request).andExpect(status().isOk());
    }

    private void error(Map<String, Object> request, int status, String code) throws Exception {
        perform(OWNER, id, request)
                .andExpect(status().is(status))
                .andExpect(jsonPath("$.error.code").value(code))
                .andExpect(jsonPath("$.error.message").isString());
    }

    private ResultActions perform(UUID user, UUID presentation, Map<String, Object> request) throws Exception {
        MockHttpServletRequestBuilder builder =
                post(TEXTS, presentation).with(as(user)).with(csrf()).contentType("application/json").content(body(request));
        return mvc.perform(builder);
    }

    private JsonNode read(ResultActions result) throws Exception {
        return json.readTree(result.andReturn().getResponse().getContentAsString(UTF_8));
    }

    private String body(Map<String, Object> request) {
        return json.writeValueAsString(request);
    }

    private static RequestPostProcessor as(UUID user) {
        return authentication(
                UsernamePasswordAuthenticationToken.authenticated(
                        new AuthPrincipal(user, user + "@example.test", 0),
                        null,
                        AuthorityUtils.createAuthorityList(SecurityPolicy.USER_AUTHORITY)));
    }

    private static Map<String, Object> request(
            String action, Map<String, String> params, Map<String, Object> target, String text) {
        Map<String, Object> request = new LinkedHashMap<>();
        request.put("request_id", UUID.randomUUID().toString());
        request.put("action", action);
        request.put("params", params);
        request.put("target", target);
        request.put("text", text);
        request.put("refines_edit_id", null);
        request.put("variants", 1);
        request.put("model", null);
        return request;
    }

    private Map<String, Object> fieldTarget() {
        Map<String, Object> target = new HashMap<>();
        target.put("kind", "template_field");
        target.put("slide_id", "slide-1");
        target.put("field_key", field);
        target.put("block_id", null);
        return target;
    }

    private static Map<String, Object> blockTarget() {
        Map<String, Object> target = new HashMap<>();
        target.put("kind", "custom_block");
        target.put("slide_id", "slide-1");
        target.put("field_key", null);
        target.put("block_id", BLOCK);
        return target;
    }

    @SuppressWarnings("unchecked")
    private String slideOneField() {
        List<String> fields = (List<String>) templates.slideManifest(TEMPLATE).getFirst().get("fields");
        return fields.stream().filter(name -> !name.equals("TITLE")).findFirst().orElse(fields.getFirst());
    }

    @SuppressWarnings("unchecked")
    private String foreignField() {
        List<String> fields = (List<String>) templates.slideManifest(TEMPLATE).getFirst().get("fields");
        return templates.fields(TEMPLATE).keySet().stream().filter(name -> !fields.contains(name)).findFirst().orElseThrow();
    }

    private UUID readyPresentation(UUID user) {
        Map<String, String> fields = new LinkedHashMap<>();
        templates.fields(TEMPLATE).keySet().forEach(key -> fields.put(key, "Другое поле"));
        fields.put("TITLE", "GoDeck для отделов продаж");
        List<PresentationContent.Slide> slides = new ArrayList<>();
        for (int number = 1; number <= templates.slideManifest(TEMPLATE).size(); number++)
            slides.add(
                    new PresentationContent.Slide(
                            number,
                            number == 1,
                            "AI edit test",
                            false,
                            number == 1
                                    ? List.of(new PresentationContent.TextBlock(BLOCK, "Заметка", 10, 60, 40, 20, 18, 400, "left", "ink"))
                                    : List.of(),
                            List.of(),
                            List.of()));
        UUID created = service.create(user, TEMPLATE, "Тема презентации", "manual", null, null, null, null, null).id();
        service.submitManual(user, created, new PresentationContent(fields, slides));
        worker.processOne();
        return created;
    }

    private Map<String, Object> documentState(UUID presentation) {
        Map<String, Object> state =
                new LinkedHashMap<>(
                        db.queryForMap(
                                "SELECT content_json, editor_json, editor_revision, current_version, output_path, edit_id,"
                                        + " status FROM generated_presentations WHERE id=?",
                                presentation));
        state.put(
                "revisions",
                db.queryForList("SELECT version, output_path FROM presentation_revisions WHERE presentation_id=? ORDER BY version", presentation));
        return state;
    }

    private List<Path> files() throws Exception {
        if (!Files.exists(OUTPUT)) return List.of();
        try (Stream<Path> files = Files.walk(OUTPUT)) {
            return files.sorted().toList();
        }
    }

    private JsonNode editor() throws Exception {
        return json.readTree(
                mvc.perform(get("/api/generation/v1/presentations/{id}/editor", id).with(as(OWNER)))
                        .andExpect(status().isOk())
                        .andReturn()
                        .getResponse()
                        .getContentAsString(UTF_8));
    }

    /** Autosave body that keeps the loaded document and its custom block. */
    private String draft(JsonNode editor) {
        List<Map<String, Object>> slides = new ArrayList<>();
        for (JsonNode slide : editor.path("slides")) {
            List<Map<String, Object>> blocks = new ArrayList<>();
            List<Map<String, Object>> custom = new ArrayList<>();
            var seen = new java.util.HashSet<String>();
            for (JsonNode block : slide.path("blocks")) {
                if (block.path("field_key").isNull()) {
                    custom.add(
                            Map.of(
                                    "id", block.path("id").asText(),
                                    "text", block.path("text").asText(),
                                    "x", block.path("x").asDouble(),
                                    "y", block.path("y").asDouble(),
                                    "width", block.path("width").asDouble(),
                                    "height", block.path("height").asDouble(),
                                    "font_size", block.path("font_size").asInt(),
                                    "weight", block.path("weight").asInt(),
                                    "align", block.path("align").asText(),
                                    "color", block.path("color").asText()));
                    continue;
                }
                if (seen.add(block.path("field_key").asText()))
                    blocks.add(Map.of("field_key", block.path("field_key").asText(), "text", block.path("text").asText()));
            }
            slides.add(
                    Map.of(
                            "source_slide_number", slide.path("source_slide_number").asInt(),
                            "name", slide.path("name").asText(),
                            "hidden", false,
                            "blocks", blocks,
                            "custom_blocks", custom));
        }
        return json.writeValueAsString(
                Map.of("base_version", editor.path("base_version").asInt(), "draft_revision", editor.path("draft_revision").asLong(), "title", "Черновик", "slides", slides));
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

    private UUID insertCall(String operation, Instant startedAt) {
        UUID callId = UUID.randomUUID();
        db.update(
                "INSERT INTO presentation_ai_calls (id, presentation_id, operation, model, request_body, started_at)"
                        + " VALUES (?, ?, ?, 'gpt-5.4-mini', '{}', ?)",
                callId,
                id,
                operation,
                Timestamp.from(startedAt));
        return callId;
    }

    private List<UUID> ids(String table) {
        return db.queryForList("SELECT id FROM " + table, UUID.class);
    }
}
