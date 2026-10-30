package ru.godeck.presentation.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.anything;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import static java.nio.charset.StandardCharsets.UTF_8;

import org.apache.poi.xslf.usermodel.XMLSlideShow;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.client.RestClient;

import ru.godeck.presentation.ai.OpenAiResponseReader;
import ru.godeck.presentation.ai.PresentationContentGenerator;
import ru.godeck.presentation.ai.PresentationRequestFactory;
import ru.godeck.presentation.dto.EditorDeckView;
import ru.godeck.presentation.dto.EditorDraftSavedView;
import ru.godeck.presentation.dto.PresentationView;
import ru.godeck.presentation.dto.SaveEditorDraftRequest;
import ru.godeck.presentation.exception.GenerationException;
import ru.godeck.presentation.mapper.PresentationContentCodec;
import ru.godeck.presentation.material.MaterialRetention;
import ru.godeck.presentation.model.AiCallContext;
import ru.godeck.presentation.model.AiOperation;
import ru.godeck.presentation.model.GenerationInput;
import ru.godeck.presentation.model.PresentationContent;
import ru.godeck.presentation.model.PresentationStatus;
import ru.godeck.presentation.model.SourceMaterial;
import ru.godeck.presentation.template.PresentationTemplateService;
import ru.godeck.presentation.worker.PresentationWorker;

import tools.jackson.databind.ObjectMapper;

import java.io.ByteArrayInputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

@SpringBootTest(
        properties = {
            "godeck.auth.dev-bypass=true",
            "godeck.generation.poll-ms=86400000",
            "spring.datasource.hikari.schema=generation_test",
            "spring.flyway.default-schema=generation_test",
            "spring.flyway.schemas=generation_test"
        })
@AutoConfigureMockMvc
class PresentationGenerationIntegrationTest {
    static final UUID USER = UUID.nameUUIDFromBytes("godeck-local-debug-user".getBytes(UTF_8));
    static final Path OUTPUT =
            Path.of(
                    System.getProperty("java.io.tmpdir"),
                    "godeck-generation-test-" + UUID.randomUUID());
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate db;
    @Autowired ObjectMapper json;
    @Autowired PresentationTemplateService templates;
    @Autowired PresentationService service;
    @Autowired PresentationWorker worker;
    @Autowired PresentationContentCodec codec;
    @Autowired PresentationTransactions transactions;
    @Autowired PresentationEditorService editor;
    @Autowired PresentationAiCallHistory aiHistory;
    @Autowired PlatformTransactionManager transactionManager;
    @Autowired MaterialRetention materialRetention;
    @MockitoBean PresentationContentGenerator generator;

    @DynamicPropertySource
    static void configuration(DynamicPropertyRegistry properties) {
        String database =
                System.getenv()
                        .getOrDefault(
                                "TEST_DATABASE_URL",
                                "jdbc:postgresql://127.0.0.1:5433/godeck?currentSchema=auth_test");
        properties.add(
                "spring.datasource.url",
                () -> database.replace("currentSchema=auth_test", "currentSchema=generation_test"));
        properties.add("godeck.generation.data-dir", OUTPUT::toString);
    }

    @BeforeEach
    void clean() {
        db.update("DELETE FROM generated_presentations");
        when(generator.enabled()).thenReturn(true);
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
    void reviewedSourceSnapshotSurvivesQueueAndFlowsToWorkerWithoutLeakingInPublicViews()
            throws Exception {
        var request =
                Map.of(
                        "template_id",
                        "aurora",
                        "topic",
                        "Summarize report",
                        "mode",
                        "openai",
                        "goal",
                        "Explain results",
                        "audience",
                        "Board",
                        "source",
                        Map.of(
                                "format",
                                "txt",
                                "name",
                                "report.txt",
                                "text",
                                "User-reviewed private revenue: 42"));
        var response =
                mvc.perform(
                                post("/api/generation/v1/presentations")
                                        .with(csrf())
                                        .contentType("application/json")
                                        .content(json.writeValueAsString(request)))
                        .andExpect(status().isAccepted())
                        .andReturn()
                        .getResponse()
                        .getContentAsString();
        UUID id = UUID.fromString(json.readTree(response).path("id").asText());
        String snapshot =
                db.queryForObject(
                        "SELECT generation_input_json FROM generated_presentations WHERE id=?",
                        String.class,
                        id);
        assertThat(snapshot).contains("User-reviewed private revenue: 42", "Board");
        assertThat(response).doesNotContain("User-reviewed", "generation_input_json", "source");
        assertThat(json.writeValueAsString(service.list(USER, 20, 0)))
                .doesNotContain("User-reviewed");
        when(generator.generate(
                        any(),
                        anyString(),
                        anyMap(),
                        anyList(),
                        anyString(),
                        any(GenerationInput.class)))
                .thenReturn(typedPlan("Report based on materials"));
        prepareAndPublish();
        var input = org.mockito.ArgumentCaptor.forClass(GenerationInput.class);
        verify(generator)
                .generate(any(), anyString(), anyMap(), anyList(), anyString(), input.capture());
        assertThat(input.getValue().source().text()).isEqualTo("User-reviewed private revenue: 42");
        assertThat(input.getValue().audience()).isEqualTo("Board");
        assertThat(service.get(USER, id).status()).isEqualTo(PresentationStatus.SUCCEEDED);
        assertThat(Files.readAllBytes(service.download(USER, id))).isNotEmpty();
        assertThat(
                        assertThrows(
                                        GenerationException.class,
                                        () -> service.get(UUID.randomUUID(), id))
                                .status())
                .isEqualTo(404);
    }

    @Test
    void sourceIdempotencyIncludesEditedTextWhileLegacyHashRemainsUnchanged() throws Exception {
        var source =
                new ru.godeck.presentation.model.SourceMaterial(
                        "txt", "report.txt", " Revenue 42\r\n ");
        var first =
                create(
                        USER,
                        "aurora",
                        "Report",
                        "openai",
                        "source-retry-key",
                        null,
                        null,
                        null,
                        source);
        var repeated =
                create(
                        USER,
                        "aurora",
                        "Report",
                        "openai",
                        "source-retry-key",
                        null,
                        null,
                        null,
                        new ru.godeck.presentation.model.SourceMaterial(
                                "txt", "report.txt", "Revenue 42"));
        assertThat(repeated.id()).isEqualTo(first.id());
        assertThatThrownBy(
                        () ->
                                create(
                                        USER,
                                        "aurora",
                                        "Report",
                                        "openai",
                                        "source-retry-key",
                                        null,
                                        null,
                                        null,
                                        new ru.godeck.presentation.model.SourceMaterial(
                                                "txt", "report.txt", "Revenue 43")))
                .extracting(error -> ((GenerationException) error).code())
                .isEqualTo("idempotency_conflict");
        var legacy = create(USER, "aurora", "Legacy", "manual", "legacy-retry-key", null);
        String model =
                db.queryForObject(
                        "SELECT model FROM generated_presentations WHERE id=?",
                        String.class,
                        legacy.id());
        assertThat(
                        db.queryForObject(
                                "SELECT request_hash FROM generated_presentations WHERE id=?",
                                String.class,
                                legacy.id()))
                .isEqualTo(
                        ru.godeck.common.security.Hashing.sha256(
                                "aurora\nLegacy\nmanual\n" + model));
        assertThat(
                        create(
                                        USER,
                                        "aurora",
                                        "Legacy",
                                        "manual",
                                        "legacy-retry-key",
                                        null,
                                        " ",
                                        null,
                                        null)
                                .id())
                .isEqualTo(legacy.id());
    }

    @Test
    void manualModeAndOversizedEditedPreviewCannotBypassValidation() throws Exception {
        for (var request :
                List.of(
                        Map.of(
                                "template_id",
                                "aurora",
                                "topic",
                                "Report",
                                "mode",
                                "manual",
                                "source",
                                Map.of("format", "txt", "name", "x.txt", "text", "data")),
                        Map.of(
                                "template_id",
                                "aurora",
                                "topic",
                                "Report",
                                "mode",
                                "openai",
                                "source",
                                Map.of(
                                        "format",
                                        "txt",
                                        "name",
                                        "x.txt",
                                        "text",
                                        "x".repeat(30_001))))) {
            mvc.perform(
                            post("/api/generation/v1/presentations")
                                    .with(csrf())
                                    .contentType("application/json")
                                    .content(json.writeValueAsString(request)))
                    .andExpect(status().isUnprocessableContent());
        }
        assertThat(db.queryForObject("SELECT count(*) FROM generated_presentations", Long.class))
                .isZero();
    }

    @Test
    void retentionClearsOnlyOldTerminalInputSnapshots() {
        var source =
                new ru.godeck.presentation.model.SourceMaterial("txt", "x.txt", "Private input");
        var completed =
                create(USER, "aurora", "Finished", "openai", null, null, null, null, source);
        var queued = create(USER, "aurora", "Queued", "openai", null, null, null, null, source);
        var before = java.time.Instant.now().minus(java.time.Duration.ofDays(31));
        db.update(
                "UPDATE generated_presentations SET"
                        + " status='succeeded',generation_input_expires_at=? WHERE id=?",
                java.sql.Timestamp.from(before),
                completed.id());
        db.update(
                "UPDATE generated_presentations SET generation_input_expires_at=? WHERE id=?",
                java.sql.Timestamp.from(before),
                queued.id());
        assertThat(materialRetention.clearExpired()).isEqualTo(1);
        assertThat(
                        db.queryForObject(
                                "SELECT generation_input_json FROM generated_presentations WHERE"
                                        + " id=?",
                                String.class,
                                completed.id()))
                .isNull();
        assertThat(
                        db.queryForObject(
                                "SELECT generation_input_json FROM generated_presentations WHERE"
                                        + " id=?",
                                String.class,
                                queued.id()))
                .contains("Private input");
    }

    @Test
    void manualPlanRendersAndDownloadsThroughTheAdvertisedUrlWithoutOpenAi() throws Exception {
        when(generator.enabled()).thenReturn(false);
        UUID id = createManual();
        mvc.perform(
                        put("/api/generation/v1/presentations/{id}/content", id)
                                .with(csrf())
                                .contentType("application/json")
                                .content(json.writeValueAsString(plan("Квартальный план"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("queued"));
        prepareAndPublish();
        var presentation = service.get(USER, id);
        assertThat(presentation.status()).isEqualTo(PresentationStatus.SUCCEEDED);
        assertThat(json.writeValueAsString(presentation))
                .doesNotContain("request_hash", "output_path", "idempotency_key");
        byte[] bytes =
                mvc.perform(get((String) presentation.downloadUrl()))
                        .andExpect(status().isOk())
                        .andExpect(header().string("Cache-Control", "no-store"))
                        .andReturn()
                        .getResponse()
                        .getContentAsByteArray();
        try (var show = new XMLSlideShow(new ByteArrayInputStream(bytes))) {
            assertThat(show.getSlides()).hasSize(1);
            String text =
                    show.getSlides().getFirst().getShapes().stream()
                            .filter(org.apache.poi.xslf.usermodel.XSLFTextShape.class::isInstance)
                            .map(org.apache.poi.xslf.usermodel.XSLFTextShape.class::cast)
                            .map(org.apache.poi.xslf.usermodel.XSLFTextShape::getText)
                            .collect(java.util.stream.Collectors.joining("\n"));
            assertThat(text).contains("Квартальный план").doesNotContain("{{");
        }
        assertThat(service.versions(USER, id)).hasSize(1);
        verify(generator, never()).generate(any(), anyString(), anyMap(), anyList(), anyString());
        var notFound =
                assertThrows(
                        GenerationException.class, () -> service.download(UUID.randomUUID(), id));
        assertThat(notFound.status()).isEqualTo(404);
    }

    @Test
    void rejectsDuplicateAndOutOfRangeSlideDecisionsBeforeQueueing() throws Exception {
        UUID id = createManual();
        for (Number index : List.of(1, 999, 1.5)) {
            var input = plan("Корректная тема");
            var decisions = new ArrayList<>((List<Map<String, Object>>) input.get("slides"));
            decisions.set(1, Map.of("slide", index, "include", true, "reason", "test"));
            input.put("slides", decisions);
            mvc.perform(
                            put("/api/generation/v1/presentations/{id}/content", id)
                                    .with(csrf())
                                    .contentType("application/json")
                                    .content(json.writeValueAsString(input)))
                    .andExpect(status().isUnprocessableContent());
        }
        assertThat(service.get(USER, id).status()).isEqualTo(PresentationStatus.AWAITING_CONTENT);
    }

    @Test
    void chatWritesANewVersionAndFailurePreservesThePreviousFile() throws Exception {
        UUID id = readyManual();
        byte[] original = Files.readAllBytes(service.download(USER, id));
        when(generator.generate(any(), anyString(), anyMap(), anyList(), anyString()))
                .thenReturn(typedPlan("Обновлённый план"));
        mvc.perform(
                        post("/api/generation/v1/presentations/{id}/chat", id)
                                .with(csrf())
                                .contentType("application/json")
                                .content("{\"message\":\"Обнови заголовок\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.version").value(2));
        assertThat(service.versions(USER, id)).hasSize(2);
        String firstFile =
                db.queryForObject(
                        "SELECT output_path FROM presentation_revisions WHERE presentation_id=? AND"
                                + " version=1",
                        String.class,
                        id);
        assertThat(Files.readAllBytes(Path.of(firstFile))).isEqualTo(original);
        byte[] latest = Files.readAllBytes(service.download(USER, id));
        when(generator.generate(any(), anyString(), anyMap(), anyList(), anyString()))
                .thenThrow(new IllegalStateException("simulated failure"));
        mvc.perform(
                        post("/api/generation/v1/presentations/{id}/chat", id)
                                .with(csrf())
                                .contentType("application/json")
                                .content("{\"message\":\"Ещё одна правка\"}"))
                .andExpect(status().isBadGateway());
        assertThat(service.get(USER, id).version()).isEqualTo(2);
        assertThat(Files.readAllBytes(service.download(USER, id))).isEqualTo(latest);
        assertThat(service.versions(USER, id)).hasSize(2);
        assertThat(
                        db.queryForObject(
                                "SELECT edit_id FROM generated_presentations WHERE id=?",
                                UUID.class,
                                id))
                .isNull();
        doReturn(typedPlan("Повторная правка"))
                .when(generator)
                .generate(any(), anyString(), anyMap(), anyList(), anyString());
        assertThat(service.chat(USER, id, "Повтори после ошибки", null).version()).isEqualTo(3);
    }

    @Test
    void concurrentChatIsRejectedBeforeAnotherModelCall() throws Exception {
        UUID id = readyManual();
        new TransactionTemplate(transactionManager)
                .executeWithoutResult(
                        tx -> {
                            db.queryForObject(
                                    "SELECT id FROM generated_presentations WHERE id=? FOR UPDATE",
                                    UUID.class,
                                    id);
                            var other =
                                    CompletableFuture.supplyAsync(
                                            () ->
                                                    assertThrows(
                                                            GenerationException.class,
                                                            () ->
                                                                    service.chat(
                                                                            USER,
                                                                            id,
                                                                            "Параллельная правка",
                                                                            null)));
                            try {
                                assertThat(other.get(5, TimeUnit.SECONDS).code())
                                        .isEqualTo("edit_in_progress");
                            } catch (Exception error) {
                                throw new IllegalStateException(error);
                            }
                        });
        verify(generator, never()).generate(any(), anyString(), anyMap(), anyList(), anyString());
    }

    @Test
    void idempotencyKeyIncludesTheChosenModeAndUnknownModesAreRejected() throws Exception {
        String key = UUID.randomUUID().toString();
        var first = create(USER, "aurora", "Один и тот же запрос", "manual", key, null);
        assertThat(create(USER, "aurora", "Один и тот же запрос", "manual", key, null))
                .isEqualTo(first);
        assertThat(
                        assertThrows(
                                        GenerationException.class,
                                        () ->
                                                create(
                                                        USER,
                                                        "aurora",
                                                        "Один и тот же запрос",
                                                        "openai",
                                                        key,
                                                        null))
                                .status())
                .isEqualTo(409);
        assertThat(
                        assertThrows(
                                        GenerationException.class,
                                        () ->
                                                create(
                                                        USER,
                                                        "aurora",
                                                        "Один и тот же запрос",
                                                        "manual",
                                                        key,
                                                        "gpt-6-astra"))
                                .status())
                .isEqualTo(409);
        assertThat(
                        assertThrows(
                                        GenerationException.class,
                                        () ->
                                                create(
                                                        USER,
                                                        "aurora",
                                                        "Один и тот же запрос",
                                                        "unknown",
                                                        null,
                                                        null))
                                .status())
                .isEqualTo(422);
        mvc.perform(get("/api/generation/v1/templates/unknown/context"))
                .andExpect(status().isNotFound());
    }

    @Test
    void selectedModelSurvivesTheQueueAndChatCanOverrideIt() throws Exception {
        mvc.perform(get("/api/generation/v1/models"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.default_model").exists())
                .andExpect(
                        jsonPath("$.items[*].id")
                                .value(
                                        org.hamcrest.Matchers.hasItems(
                                                "gpt-6.1-sol",
                                                "gpt-6-luna",
                                                "gpt-6-astra",
                                                "gpt-5.6-sol",
                                                "gpt-5.6-terra",
                                                "gpt-5.6-luna",
                                                "gpt-5.4",
                                                "gpt-5.4-mini")));
        when(generator.generate(any(), anyString(), anyMap(), anyList(), anyString()))
                .thenReturn(typedPlan("План выступления"));
        var created =
                create(
                        USER,
                        "aurora",
                        "Презентация с выбранной моделью",
                        "openai",
                        null,
                        "gpt-6-luna");
        UUID id = created.id();
        assertThat(created.model()).isEqualTo("gpt-6-luna");
        prepareAndPublish();
        verify(generator).generate(any(), anyString(), anyMap(), anyList(), eq("gpt-6-luna"));
        assertThat(service.versions(USER, id).getFirst().model()).isEqualTo("gpt-6-luna");

        mvc.perform(
                        post("/api/generation/v1/presentations/{id}/chat", id)
                                .with(csrf())
                                .contentType("application/json")
                                .content(
                                        "{\"message\":\"Уточни"
                                                + " заключение\",\"model\":\"gpt-6-astra\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.presentation.model").value("gpt-6-astra"));
        assertThat(service.versions(USER, id).getLast().model()).isEqualTo("gpt-6-astra");
        service.chat(USER, id, "Сократи заключение", null);
        verify(generator, times(2))
                .generate(any(), anyString(), anyMap(), anyList(), eq("gpt-6-astra"));
    }

    @Test
    void arbitraryModelIsRejectedBeforeAnyProviderCall() throws Exception {
        mvc.perform(
                        post("/api/generation/v1/prompts/preview")
                                .with(csrf())
                                .contentType("application/json")
                                .content(
                                        "{\"template_id\":\"aurora\",\"topic\":\"Тестовый"
                                                + " запрос\",\"model\":\"unknown-model\"}"))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.error.code").value("unsupported_model"));
        mvc.perform(
                        post("/api/generation/v1/presentations")
                                .with(csrf())
                                .contentType("application/json")
                                .content(
                                        "{\"template_id\":\"aurora\",\"topic\":\"Тестовый"
                                                + " запрос\",\"mode\":\"manual\",\"model\":42}"))
                .andExpect(status().isUnprocessableContent());
        verifyNoInteractions(generator);
    }

    @Test
    void providerWorkRunsWithoutDatabaseTransactionAndConcurrentEditIsRejected() throws Exception {
        UUID id = readyManual();
        var started = new java.util.concurrent.CountDownLatch(1);
        var release = new java.util.concurrent.CountDownLatch(1);
        when(generator.generate(any(), anyString(), anyMap(), anyList(), anyString()))
                .thenAnswer(
                        invocation -> {
                            assertThat(
                                            org.springframework.transaction.support
                                                    .TransactionSynchronizationManager
                                                    .isActualTransactionActive())
                                    .isFalse();
                            started.countDown();
                            if (!release.await(10, TimeUnit.SECONDS))
                                throw new IllegalStateException("Test did not release provider");
                            return typedPlan("Новая версия");
                        });
        var first =
                CompletableFuture.supplyAsync(() -> service.chat(USER, id, "Первая правка", null));
        try {
            assertThat(started.await(10, TimeUnit.SECONDS)).isTrue();
            // The reservation is committed, but there is no row lock while the model runs.
            new TransactionTemplate(transactionManager)
                    .executeWithoutResult(
                            tx ->
                                    db.queryForObject(
                                            "SELECT id FROM generated_presentations WHERE id=? FOR"
                                                    + " UPDATE NOWAIT",
                                            UUID.class,
                                            id));
            assertThat(
                            assertThrows(
                                            GenerationException.class,
                                            () -> service.chat(USER, id, "Вторая правка", null))
                                    .code())
                    .isEqualTo("edit_in_progress");
        } finally {
            release.countDown();
        }
        assertThat(first.get(10, TimeUnit.SECONDS).version()).isEqualTo(2);
        assertThat(
                        db.queryForObject(
                                "SELECT edit_id FROM generated_presentations WHERE id=?",
                                UUID.class,
                                id))
                .isNull();
        verify(generator, times(1)).generate(any(), anyString(), anyMap(), anyList(), anyString());
    }

    @Test
    void expiredEditCannotOverwriteOrReleaseANewerReservation() throws Exception {
        UUID id = readyManual();
        var old = transactions.beginEdit(USER, id, null);
        db.update(
                "UPDATE generated_presentations SET edit_started_at=now()-interval '6 minutes'"
                        + " WHERE id=?",
                id);
        var current = transactions.beginEdit(USER, id, "gpt-6-astra");
        assertThat(current.token()).isNotEqualTo(old.token());
        assertThat(
                        assertThrows(
                                        GenerationException.class,
                                        () ->
                                                transactions.completeEdit(
                                                        old,
                                                        "Устаревшая правка",
                                                        "{}",
                                                        "unused",
                                                        1))
                                .code())
                .isEqualTo("edit_expired");
        transactions.releaseEdit(old);
        assertThat(
                        db.queryForObject(
                                "SELECT edit_id FROM generated_presentations WHERE id=?",
                                UUID.class,
                                id))
                .isEqualTo(current.token());
        transactions.releaseEdit(current);
        assertThat(service.get(USER, id).version()).isEqualTo(1);
    }

    @Test
    void workerSkipsAQueuedJobLockedByAnotherWorker() throws Exception {
        UUID first = createManual();
        UUID second = createManual();
        service.submitManual(USER, first, typedPlan("Первый проект"));
        service.submitManual(USER, second, typedPlan("Второй проект"));
        new TransactionTemplate(transactionManager)
                .executeWithoutResult(
                        tx -> {
                            UUID locked =
                                    db.queryForObject(
                                            "SELECT id FROM generated_presentations WHERE"
                                                + " status='queued' ORDER BY created_at,id LIMIT 1"
                                                + " FOR UPDATE",
                                            UUID.class);
                            var claimed = CompletableFuture.supplyAsync(transactions::claim);
                            try {
                                assertThat(claimed.get(5, TimeUnit.SECONDS).orElseThrow().id())
                                        .isNotEqualTo(locked);
                            } catch (Exception error) {
                                throw new IllegalStateException(error);
                            }
                        });
        assertThat(
                        db.queryForObject(
                                "SELECT count(*) FROM generated_presentations WHERE"
                                        + " status='running'",
                                Integer.class))
                .isEqualTo(1);
        assertThat(
                        db.queryForObject(
                                "SELECT count(*) FROM generated_presentations WHERE"
                                        + " status='queued'",
                                Integer.class))
                .isEqualTo(1);
        verify(generator, never()).generate(any(), anyString(), anyMap(), anyList(), anyString());
    }

    @Test
    void concurrentCreateWithOneIdempotencyKeyReturnsOneProject() throws Exception {
        String key = UUID.randomUUID().toString();
        var gate = new java.util.concurrent.CountDownLatch(1);
        java.util.function.Supplier<PresentationView> create =
                () -> {
                    try {
                        gate.await();
                    } catch (InterruptedException error) {
                        Thread.currentThread().interrupt();
                        throw new IllegalStateException(error);
                    }
                    return create(USER, "aurora", "Один конкурентный запрос", "manual", key, null);
                };
        var first = CompletableFuture.supplyAsync(create);
        var second = CompletableFuture.supplyAsync(create);
        gate.countDown();
        assertThat(first.get(10, TimeUnit.SECONDS)).isEqualTo(second.get(10, TimeUnit.SECONDS));
        assertThat(db.queryForObject("SELECT count(*) FROM generated_presentations", Integer.class))
                .isEqualTo(1);
    }

    @Test
    void listPreservesAnOffsetWhichIsNotAPageBoundary() throws Exception {
        createManual();
        createManual();
        createManual();
        var all = service.list(USER, 100, 0);
        var window = service.list(USER, 2, 1);
        assertThat(window.items()).isEqualTo(all.items().subList(1, 3));
        assertThat(window.total()).isEqualTo(3);
        assertThat(service.list(UUID.randomUUID(), 20, 0).items()).isEmpty();
    }

    @Test
    void cancelledJobIsNeverRenderedOrSentToAi() throws Exception {
        UUID id = createManual();
        service.submitManual(USER, id, typedPlan("Cancelled"));
        service.cancel(USER, id);
        prepareAndPublish();
        assertThat(service.get(USER, id).status()).isEqualTo(PresentationStatus.CANCELLED);
        assertThat(service.versions(USER, id)).isEmpty();
        verify(generator, never()).generate(any(), anyString(), anyMap(), anyList(), anyString());
    }

    @Test
    void obsoleteModelFailsItsJobWithoutBlockingTheNextJob() throws Exception {
        UUID obsolete = create(USER, "aurora", "Old model", "openai", null, null).id();
        db.update("UPDATE generated_presentations SET model='retired-model' WHERE id=?", obsolete);
        UUID next = createManual();
        service.submitManual(USER, next, typedPlan("Next job"));
        // Fix queue order explicitly rather than relying on wall-clock precision.
        db.update(
                "UPDATE generated_presentations SET created_at=now()-interval '1 minute' WHERE"
                        + " id=?",
                obsolete);
        prepareAndPublish();
        assertThat(service.get(USER, obsolete).status()).isEqualTo(PresentationStatus.FAILED);
        assertThat(service.get(USER, obsolete).errorCode()).isEqualTo("unsupported_model");
        prepareAndPublish();
        assertThat(service.get(USER, next).status()).isEqualTo(PresentationStatus.SUCCEEDED);
        verify(generator, never()).generate(any(), anyString(), anyMap(), anyList(), anyString());
    }

    @Test
    void providerFailureDoesNotLeaveARevisionAndTheWorkerRemainsUsable() throws Exception {
        UUID failed = create(USER, "aurora", "Provider failure", "openai", null, null).id();
        when(generator.generate(any(), anyString(), anyMap(), anyList(), anyString()))
                .thenThrow(new IllegalStateException("provider failed"));
        prepareAndPublish();
        assertThat(service.get(USER, failed).status()).isEqualTo(PresentationStatus.FAILED);
        assertThat(service.get(USER, failed).errorCode()).isEqualTo("generation_failed");
        assertThat(service.versions(USER, failed)).isEmpty();
        UUID next = createManual();
        service.submitManual(USER, next, typedPlan("Recovery"));
        prepareAndPublish();
        assertThat(service.get(USER, next).status()).isEqualTo(PresentationStatus.SUCCEEDED);
    }

    @Test
    void staleRunningJobCannotBeCompletedAfterRecoveryMarksItFailed() throws Exception {
        UUID id = createManual();
        service.submitManual(USER, id, typedPlan("Interrupted"));
        var job = transactions.claim().orElseThrow();
        db.update(
                "UPDATE generated_presentations SET updated_at=now()-interval '6 minutes' WHERE"
                        + " id=?",
                id);
        assertThat(transactions.claim()).isEmpty();
        assertThat(service.get(USER, id).status()).isEqualTo(PresentationStatus.FAILED);
        assertThat(service.get(USER, id).errorCode()).isEqualTo("worker_interrupted");
        assertThat(
                        assertThrows(
                                        GenerationException.class,
                                        () -> transactions.prepareDraft(job, "{}"))
                                .code())
                .isEqualTo("worker_interrupted");
        assertThat(service.versions(USER, id)).isEmpty();
    }

    @Test
    void busyCancelAndManualSubmissionReturnConflictWithoutChangingTheJob() throws Exception {
        UUID id = createManual();
        String body = json.writeValueAsString(plan("Blocked"));
        new TransactionTemplate(transactionManager)
                .executeWithoutResult(
                        tx -> {
                            db.queryForObject(
                                    "SELECT id FROM generated_presentations WHERE id=? FOR UPDATE",
                                    UUID.class,
                                    id);
                            var attempt =
                                    CompletableFuture.runAsync(
                                            () -> {
                                                try {
                                                    mvc.perform(
                                                                    post(
                                                                                    "/api/generation/v1/presentations/{id}/cancel",
                                                                                    id)
                                                                            .with(csrf()))
                                                            .andExpect(status().isConflict())
                                                            .andExpect(
                                                                    jsonPath("$.error.code")
                                                                            .value(
                                                                                    "presentation_busy"));
                                                    mvc.perform(
                                                                    put(
                                                                                    "/api/generation/v1/presentations/{id}/content",
                                                                                    id)
                                                                            .with(csrf())
                                                                            .contentType(
                                                                                    "application/json")
                                                                            .content(body))
                                                            .andExpect(status().isConflict())
                                                            .andExpect(
                                                                    jsonPath("$.error.code")
                                                                            .value(
                                                                                    "presentation_busy"));
                                                } catch (Exception e) {
                                                    throw new IllegalStateException(e);
                                                }
                                            });
                            try {
                                attempt.get(5, TimeUnit.SECONDS);
                            } catch (Exception e) {
                                throw new IllegalStateException(e);
                            }
                        });
        assertThat(service.get(USER, id).status()).isEqualTo(PresentationStatus.AWAITING_CONTENT);
    }

    @Test
    void invalidPathAndQueryTypesUseTheSameValidationEnvelope() throws Exception {
        for (String url :
                List.of(
                        "/api/generation/v1/presentations/not-a-uuid",
                        "/api/generation/v1/presentations?limit=no-number"))
            mvc.perform(get(url))
                    .andExpect(status().isUnprocessableEntity())
                    .andExpect(jsonPath("$.error.code").value("invalid_input"));
    }

    @Test
    void duplicateRevisionRollsBackTheNewPointerAndRemovesItsFile() throws Exception {
        UUID id = readyManual();
        Path previous = service.download(USER, id);
        var filesBefore = outputFiles();
        // Force a real unique-constraint failure while committing version 2.
        db.update(
                """
                INSERT INTO presentation_revisions(id,presentation_id,user_id,version,message,reply,content_json,output_path,slide_count,created_at)
                SELECT ?,id,user_id,2,'Existing version','Existing reply',content_json,output_path,slide_count,now()
                FROM generated_presentations WHERE id=?
                """,
                UUID.randomUUID(),
                id);
        when(generator.generate(any(), anyString(), anyMap(), anyList(), anyString()))
                .thenReturn(typedPlan("Replacement"));
        assertThat(
                        assertThrows(
                                        GenerationException.class,
                                        () -> service.chat(USER, id, "Replace", null))
                                .code())
                .isEqualTo("edit_failed");
        assertThat(service.get(USER, id).version()).isEqualTo(1);
        assertThat(service.download(USER, id)).isEqualTo(previous);
        assertThat(outputFiles()).isEqualTo(filesBefore);
        assertThat(
                        db.queryForObject(
                                "SELECT edit_id FROM generated_presentations WHERE id=?",
                                UUID.class,
                                id))
                .isNull();
    }

    @Test
    void activeQuotaBlocksNewJobsButStillPermitsAnIdempotentRetry() {
        String key = UUID.randomUUID().toString();
        var first = create(USER, "aurora", "One", "manual", key, null);
        create(USER, "aurora", "Two", "manual", null, null);
        create(USER, "aurora", "Three", "manual", null, null);
        assertThat(
                        assertThrows(
                                        GenerationException.class,
                                        () -> create(USER, "aurora", "Four", "manual", null, null))
                                .code())
                .isEqualTo("generation_limit");
        assertThat(create(USER, "aurora", "One", "manual", key, null).id()).isEqualTo(first.id());
        service.cancel(USER, first.id());
        assertThat(create(USER, "aurora", "Replacement", "manual", null, null)).isNotNull();
    }

    private java.util.Set<Path> outputFiles() throws Exception {
        if (!Files.exists(OUTPUT)) return java.util.Set.of();
        try (var paths = Files.list(OUTPUT)) {
            return paths.collect(java.util.stream.Collectors.toSet());
        }
    }

    @Test
    void manualRenderingDoesNotDependOnAnAvailableAiModel() throws Exception {
        UUID id = createManual();
        service.submitManual(USER, id, typedPlan("Offline plan"));
        db.update("UPDATE generated_presentations SET model='retired-model' WHERE id=?", id);
        prepareAndPublish();
        assertThat(service.get(USER, id).status()).isEqualTo(PresentationStatus.SUCCEEDED);
        verify(generator, never()).generate(any(), anyString(), anyMap(), anyList(), anyString());
    }

    private UUID createManual() throws Exception {
        var result =
                mvc.perform(
                                post("/api/generation/v1/presentations")
                                        .with(csrf())
                                        .contentType("application/json")
                                        .content(
                                                "{\"template_id\":\"aurora\",\"topic\":\"Тестовый"
                                                        + " ручной проект\",\"mode\":\"manual\"}"))
                        .andExpect(status().isAccepted())
                        .andReturn();
        return UUID.fromString(
                json.readTree(result.getResponse().getContentAsString()).path("id").asText());
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = {"atlas", "monolith", "nord", "opal"})
    void pastedContentUsesTheChosenTemplateWithoutCallingOpenAi(String templateId)
            throws Exception {
        when(generator.enabled()).thenReturn(false);
        mvc.perform(get("/api/generation/v1/templates/{id}/context", templateId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fields.TITLE").value(44))
                .andExpect(
                        jsonPath("$.template_description.field_hints.TITLE.description")
                                .isNotEmpty());
        Map<String, String> fields = new LinkedHashMap<>();
        templates.fields(templateId).keySet().forEach(field -> fields.put(field, ""));
        fields.put("TITLE", "Ответ LLM");
        var content =
                new PresentationContent(
                        fields,
                        java.util.stream.IntStream.rangeClosed(1, 13)
                                .mapToObj(
                                        n ->
                                                new PresentationContent.Slide(
                                                        n, n == 1 || n == 5, "Так решила модель"))
                                .toList());
        UUID id = create(USER, templateId, "Ответ LLM", "manual", null, null).id();
        mvc.perform(
                        put("/api/generation/v1/presentations/{id}/content", id)
                                .with(csrf())
                                .contentType("application/json")
                                .content(json.writeValueAsString(content)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("queued"));
        prepareAndPublish();
        assertThat(service.get(USER, id).status()).isEqualTo(PresentationStatus.SUCCEEDED);
        assertThat(service.get(USER, id).slideCount()).isEqualTo(2);
        byte[] pptx =
                mvc.perform(get(service.get(USER, id).downloadUrl()))
                        .andExpect(status().isOk())
                        .andReturn()
                        .getResponse()
                        .getContentAsByteArray();
        try (var show = new XMLSlideShow(new ByteArrayInputStream(pptx))) {
            assertThat(show.getSlides()).hasSize(2);
        }
        verify(generator, never()).generate(any(), anyString(), anyMap(), anyList(), anyString());
    }

    @Test
    void generationAndChatReceiveTheDescriptionOfTheSavedTemplate() throws Exception {
        String templateId = "nord";
        var description = templates.description(templateId);
        when(generator.preview(anyString(), anyMap(), anyList(), anyString()))
                .thenReturn(Map.of("test", true));
        service.previewPrompt(templateId, "Тема доклада", null, null, null, null);
        verify(generator)
                .preview(
                        contains(description.path("style").asText()),
                        eq(templates.fields(templateId)),
                        anyList(),
                        anyString());
        Map<String, String> fields = new LinkedHashMap<>();
        templates.fields(templateId).keySet().forEach(field -> fields.put(field, "Текст"));
        var content =
                new PresentationContent(
                        fields,
                        java.util.stream.IntStream.rangeClosed(1, 13)
                                .mapToObj(n -> new PresentationContent.Slide(n, n == 1, "Обложка"))
                                .toList());
        when(generator.generate(any(), anyString(), anyMap(), anyList(), anyString()))
                .thenReturn(content);
        UUID id = create(USER, templateId, "Норд для доклада", "openai", null, null).id();
        prepareAndPublish();
        assertThat(service.get(USER, id).status()).isEqualTo(PresentationStatus.SUCCEEDED);
        assertThat(service.chat(USER, id, "Сохрани стиль", null).version()).isEqualTo(2);
        verify(generator, times(2))
                .generate(
                        any(),
                        contains(description.path("style").asText()),
                        eq(templates.fields(templateId)),
                        anyList(),
                        anyString());
    }

    @Test
    void generationStoresTheActualProviderExchangeAndExposesItToTheOwner() throws Exception {
        var server = recordedProvider();
        String response = providerResponse(typedPlan("Запись генерации"));
        server.expect(anything()).andRespond(withSuccess(response, MediaType.APPLICATION_JSON));
        UUID id = create(USER, "aurora", "Проверяем историю генерации", "openai", null, null).id();
        prepareAndPublish();
        assertThat(service.get(USER, id).status()).isEqualTo(PresentationStatus.SUCCEEDED);
        var history = service.aiCalls(USER, id);
        assertThat(history).hasSize(1);
        assertThat(history.getFirst().operation()).isEqualTo("generation");
        assertThat(history.getFirst().requestBody())
                .contains("Проверяем историю генерации", "instructions", "json_schema")
                .doesNotContain("integration-test-key", "Authorization");
        assertThat(history.getFirst().responseBody()).isEqualTo(response);
        assertThat(history.getFirst().durationMs()).isNotNegative();
        mvc.perform(get("/api/generation/v1/presentations/{id}/ai-calls", id))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.items[0].http_status").value(200))
                .andExpect(jsonPath("$.items[0].error_code").doesNotExist());
        server.verify();
    }

    @Test
    void failedChatExchangeIsKeptAndASecondEditCanSucceed() throws Exception {
        UUID id = readyManual();
        var server = recordedProvider();
        server.expect(anything())
                .andRespond(
                        withStatus(HttpStatus.TOO_MANY_REQUESTS)
                                .body("provider limit integration-test-key")
                                .contentType(MediaType.TEXT_PLAIN));
        assertThrows(
                GenerationException.class, () -> service.chat(USER, id, "Сократи текст", null));
        var failed = service.aiCalls(USER, id).getFirst();
        assertThat(failed.operation()).isEqualTo("chat");
        assertThat(failed.httpStatus()).isEqualTo(429);
        assertThat(failed.responseBody()).isEqualTo("provider limit [REDACTED]");
        assertThat(failed.errorCode()).isEqualTo("generation_failed");
        assertThat(service.get(USER, id).version()).isEqualTo(1);
        server.verify();
        server.reset();
        String response = providerResponse(typedPlan("Исправленный план"));
        server.expect(anything()).andRespond(withSuccess(response, MediaType.APPLICATION_JSON));
        assertThat(service.chat(USER, id, "Попробуй ещё раз", null).version()).isEqualTo(2);
        var history = service.aiCalls(USER, id);
        assertThat(history).hasSize(2);
        assertThat(history.getFirst().responseBody()).isEqualTo(response);
        assertThat(history.getFirst().requestBody()).contains("Попробуй ещё раз");
        assertThat(history.getFirst().errorCode()).isNull();
        server.verify();
    }

    @Test
    void historyRejectsOtherOwnersAndUnknownPresentations() throws Exception {
        UUID other = UUID.randomUUID();
        UUID id = create(other, "aurora", "Чужая презентация", "manual", null, null).id();
        aiHistory.start(new AiCallContext(id, AiOperation.CHAT), "gpt-5.4", "private request");
        assertThat(service.aiCalls(other, id)).hasSize(1);
        mvc.perform(get("/api/generation/v1/presentations/{id}/ai-calls", id))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/generation/v1/presentations/{id}/ai-calls", UUID.randomUUID()))
                .andExpect(status().isNotFound());
    }

    @Test
    void requestIsPersistedBeforeTheResponseAndSurvivesAnOuterRollback() throws Exception {
        UUID id = createManual();
        var context = new AiCallContext(id, AiOperation.GENERATION);
        UUID callId =
                new TransactionTemplate(transactionManager)
                        .execute(
                                status -> {
                                    UUID started =
                                            aiHistory.start(
                                                    context, "gpt-5.4", "{\"input\":\"test\"}");
                                    status.setRollbackOnly();
                                    return started;
                                });
        var pending = service.aiCalls(USER, id).getFirst();
        assertThat(pending.id()).isEqualTo(callId);
        assertThat(pending.completedAt()).isNull();
        assertThat(pending.responseBody()).isNull();
        aiHistory.complete(callId, "raw response", 200, null);
        assertThat(service.aiCalls(USER, id).getFirst().responseBody()).isEqualTo("raw response");
    }

    @Test
    void manualAssemblyAndPromptPreviewDoNotInventSentAiRequests() throws Exception {
        UUID id = readyManual();
        service.previewPrompt("aurora", "Проверяем предварительный запрос", null, null, null, null);
        assertThat(service.aiCalls(USER, id)).isEmpty();
    }

    private MockRestServiceServer recordedProvider() {
        var builder = RestClient.builder();
        var server = MockRestServiceServer.bindTo(builder).build();
        var real =
                new PresentationContentGenerator(
                        builder.build(),
                        json,
                        new PresentationRequestFactory(),
                        new OpenAiResponseReader(json, codec),
                        aiHistory,
                        "integration-test-key",
                        true);
        when(generator.generate(any(), anyString(), anyMap(), anyList(), anyString()))
                .thenAnswer(
                        invocation ->
                                real.generate(
                                        invocation.getArgument(0),
                                        invocation.getArgument(1),
                                        invocation.getArgument(2),
                                        invocation.getArgument(3),
                                        invocation.getArgument(4)));
        return server;
    }

    private String providerResponse(PresentationContent content) {
        return json.writeValueAsString(
                Map.of(
                        "status",
                        "completed",
                        "output",
                        List.of(
                                Map.of(
                                        "content",
                                        List.of(
                                                Map.of(
                                                        "type",
                                                        "output_text",
                                                        "text",
                                                        codec.encode(content)))))));
    }

    @Test
    void downloadsEveryStoredVersionThroughItsAdvertisedUrl() throws Exception {
        UUID id = readyManual();
        byte[] original = Files.readAllBytes(service.download(USER, id));
        when(generator.generate(any(), anyString(), anyMap(), anyList(), anyString()))
                .thenReturn(typedPlan("Изменённый заголовок"));
        service.chat(USER, id, "Измени заголовок", null);
        byte[] latest = Files.readAllBytes(service.download(USER, id));
        assertThat(latest).isNotEqualTo(original);
        var versions = service.versions(USER, id);
        assertThat(versions).hasSize(2);
        mvc.perform(get("/api/generation/v1/presentations/{id}/versions", id))
                .andExpect(status().isOk())
                .andExpect(
                        jsonPath("$.items[0].download_url")
                                .value(versions.getFirst().downloadUrl()));
        assertThat(json.writeValueAsString(versions))
                .doesNotContain("output_path", OUTPUT.toString());
        for (var version : versions) {
            byte[] bytes =
                    mvc.perform(get(version.downloadUrl()))
                            .andExpect(status().isOk())
                            .andExpect(header().string("Cache-Control", "no-store"))
                            .andExpect(
                                    header().string(
                                                    "Content-Type",
                                                    "application/vnd.openxmlformats-officedocument.presentationml.presentation"))
                            .andExpect(
                                    header().string(
                                                    "Content-Disposition",
                                                    "attachment; filename=\"godeck-"
                                                            + id
                                                            + "-v"
                                                            + version.version()
                                                            + ".pptx\""))
                            .andReturn()
                            .getResponse()
                            .getContentAsByteArray();
            assertThat(bytes).isEqualTo(version.version() == 1 ? original : latest);
            try (var show = new XMLSlideShow(new ByteArrayInputStream(bytes))) {
                String text =
                        show.getSlides().getFirst().getShapes().stream()
                                .filter(
                                        org.apache.poi.xslf.usermodel.XSLFTextShape.class
                                                ::isInstance)
                                .map(org.apache.poi.xslf.usermodel.XSLFTextShape.class::cast)
                                .map(org.apache.poi.xslf.usermodel.XSLFTextShape::getText)
                                .collect(java.util.stream.Collectors.joining("\n"));
                assertThat(text)
                        .contains(
                                version.version() == 1 ? "Исходный план" : "Изменённый заголовок");
            }
        }
        assertThat(service.get(USER, id).version()).isEqualTo(2);
        assertThat(Files.readAllBytes(service.download(USER, id))).isEqualTo(latest);
    }

    @Test
    void aiEditsPreserveFreeformTextAddedByTheVisualEditor() throws Exception {
        PresentationContent base = typedPlan("До AI-правки");
        var custom =
                new PresentationContent.TextBlock(
                        "text-preserved",
                        "Не удалять этот блок",
                        12,
                        18,
                        36,
                        14,
                        24,
                        400,
                        "left",
                        "ink");
        PresentationContent withCustom =
                new PresentationContent(
                        base.fields(),
                        base.slides().stream()
                                .map(
                                        slide ->
                                                slide.slide() == 1
                                                        ? new PresentationContent.Slide(
                                                                slide.slide(),
                                                                slide.include(),
                                                                slide.reason(),
                                                                slide.hiddenOrFalse(),
                                                                List.of(custom))
                                                        : slide)
                                .toList());
        UUID id = create(USER, "aurora", "Редактор и AI", "manual", null, null).id();
        service.submitManual(USER, id, withCustom);
        prepareAndPublish();
        when(generator.generate(any(), anyString(), anyMap(), anyList(), anyString()))
                .thenReturn(typedPlan("После AI-правки"));

        service.chat(USER, id, "Обнови заголовок", null);

        try (var show =
                new XMLSlideShow(
                        new ByteArrayInputStream(Files.readAllBytes(service.download(USER, id))))) {
            String text =
                    show.getSlides().getFirst().getShapes().stream()
                            .filter(org.apache.poi.xslf.usermodel.XSLFTextShape.class::isInstance)
                            .map(org.apache.poi.xslf.usermodel.XSLFTextShape.class::cast)
                            .map(org.apache.poi.xslf.usermodel.XSLFTextShape::getText)
                            .collect(java.util.stream.Collectors.joining("\n"));
            assertThat(text).contains("После AI-правки", "Не удалять этот блок");
        }
    }

    @Test
    void rejectsDownloadsOfOtherOwnersUnknownProjectsAndMissingVersions() throws Exception {
        UUID owner = UUID.randomUUID();
        UUID foreignId =
                create(owner, "aurora", "Чужой проект для скачивания", "manual", null, null).id();
        service.submitManual(owner, foreignId, typedPlan("Чужой файл"));
        prepareAndPublish();
        assertThat(service.downloadVersion(owner, foreignId, 1)).exists();
        mvc.perform(get("/api/generation/v1/presentations/{id}/versions/1/download", foreignId))
                .andExpect(status().isNotFound());
        mvc.perform(
                        get(
                                "/api/generation/v1/presentations/{id}/versions/1/download",
                                UUID.randomUUID()))
                .andExpect(status().isNotFound());
        UUID id = readyManual();
        for (int missing : List.of(-1, 0, 2)) {
            mvc.perform(
                            get(
                                    "/api/generation/v1/presentations/{id}/versions/{version}/download",
                                    id,
                                    missing))
                    .andExpect(status().isNotFound());
        }
    }

    @Test
    void missingHistoricalFileReturnsNotFoundAndLeavesLatestDownloadAvailable() throws Exception {
        UUID id = readyManual();
        when(generator.generate(any(), anyString(), anyMap(), anyList(), anyString()))
                .thenReturn(typedPlan("Последняя версия"));
        service.chat(USER, id, "Обнови презентацию", null);
        Files.delete(service.downloadVersion(USER, id, 1));
        mvc.perform(get("/api/generation/v1/presentations/{id}/versions/1/download", id))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/generation/v1/presentations/{id}/versions/2/download", id))
                .andExpect(status().isOk());
        mvc.perform(get("/api/generation/v1/presentations/{id}/download", id))
                .andExpect(status().isOk());
    }

    @Test
    @SuppressWarnings("unchecked")
    void editorAutosavesDraftAndCommitsTextOrderAndHiddenStateAsOneVersion() throws Exception {
        Map<String, String> fields = new LinkedHashMap<>();
        templates.fields("atlas").keySet().forEach(field -> fields.put(field, "Текст"));
        fields.put("TITLE", "Исходный заголовок");
        var decisions =
                java.util.stream.IntStream.rangeClosed(1, 13)
                        .mapToObj(
                                number ->
                                        new PresentationContent.Slide(
                                                number, number == 1 || number == 13, "Editor test"))
                        .toList();
        UUID id = create(USER, "atlas", "Редактор", "manual", null, null).id();
        service.submitManual(USER, id, new PresentationContent(fields, decisions));
        prepareAndPublish();
        byte[] original = Files.readAllBytes(service.download(USER, id));

        mvc.perform(
                        multipart("/api/generation/v1/presentations/{id}/editor/assets", id)
                                .file(
                                        new MockMultipartFile(
                                                "file",
                                                "fake.png",
                                                "image/png",
                                                "not an image".getBytes(UTF_8)))
                                .with(csrf()))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.error.code").value("invalid_image"));
        mvc.perform(
                        get(
                                "/api/generation/v1/presentations/{id}/editor/assets/{assetId}",
                                id,
                                UUID.randomUUID()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("image_not_found"));

        byte[] pixel = png();
        String uploadedJson =
                mvc.perform(
                                multipart("/api/generation/v1/presentations/{id}/editor/assets", id)
                                        .file(
                                                new MockMultipartFile(
                                                        "file", "pixel.png", "image/png", pixel))
                                        .with(csrf()))
                        .andExpect(status().isOk())
                        .andExpect(jsonPath("$.width").value(2))
                        .andExpect(jsonPath("$.height").value(2))
                        .andReturn()
                        .getResponse()
                        .getContentAsString();
        String assetId = json.readTree(uploadedJson).path("id").asText();
        mvc.perform(
                        get(
                                "/api/generation/v1/presentations/{id}/editor/assets/{assetId}",
                                id,
                                assetId))
                .andExpect(status().isOk())
                .andExpect(content().contentType("image/png"))
                .andExpect(content().bytes(pixel));

        String editorJson =
                mvc.perform(get("/api/generation/v1/presentations/{id}/editor", id))
                        .andExpect(status().isOk())
                        .andExpect(header().string("Cache-Control", "no-store"))
                        .andExpect(jsonPath("$.base_version").value(1))
                        .andExpect(jsonPath("$.draft_revision").value(2))
                        .andExpect(jsonPath("$.slides.length()").value(2))
                        .andExpect(jsonPath("$.slides[0].blocks[0].max_chars").isNumber())
                        .andExpect(jsonPath("$.slides[0].blocks[0].layout_id").isString())
                        .andReturn()
                        .getResponse()
                        .getContentAsString();
        var editor = json.readTree(editorJson);
        List<Map<String, Object>> loadedSlides =
                json.convertValue(
                        editor.path("slides"),
                        new tools.jackson.core.type.TypeReference<List<Map<String, Object>>>() {});
        java.util.Collections.reverse(loadedSlides);
        List<Map<String, Object>> draftSlides = new ArrayList<>();
        for (var loaded : loadedSlides) {
            int source = ((Number) loaded.get("source_slide_number")).intValue();
            List<Map<String, Object>> blocks = new ArrayList<>();
            List<Map<String, Object>> layouts = new ArrayList<>();
            var layoutIds = new java.util.LinkedHashSet<String>();
            for (var block : (List<Map<String, Object>>) loaded.get("blocks")) {
                blocks.add(
                        Map.of(
                                "field_key",
                                block.get("field_key"),
                                "text",
                                "TITLE".equals(block.get("field_key"))
                                        ? "Новый заголовок"
                                        : block.get("text")));
                String layoutId = (String) block.get("layout_id");
                if (layoutId != null && layoutIds.add(layoutId))
                    layouts.add(
                            Map.of(
                                    "id",
                                    layoutId,
                                    "x",
                                    source == 13 && layouts.isEmpty() ? 20 : block.get("x"),
                                    "y",
                                    source == 13 && layouts.isEmpty() ? 25 : block.get("y"),
                                    "width",
                                    block.get("width"),
                                    "height",
                                    block.get("height")));
            }
            draftSlides.add(
                    Map.of(
                            "source_slide_number",
                            source,
                            "name",
                            loaded.get("name"),
                            "hidden",
                            source == 13,
                            "blocks",
                            blocks,
                            "layouts",
                            layouts,
                            "custom_blocks",
                            source == 13
                                    ? List.of(
                                            Map.of(
                                                    "id", "text-editor-test",
                                                    "text", "Добавленный текст",
                                                    "x", 12,
                                                    "y", 18,
                                                    "width", 36,
                                                    "height", 14,
                                                    "font_size", 24,
                                                    "weight", 700,
                                                    "align", "center",
                                                    "color", "brand"))
                                    : List.of(),
                            "images",
                            source == 13
                                    ? List.of(
                                            Map.of(
                                                    "id", "image-editor-test",
                                                    "asset_id", assetId,
                                                    "alt", "Тестовая точка",
                                                    "x", 10,
                                                    "y", 20,
                                                    "width", 30,
                                                    "height", 25))
                                    : List.of()));
        }
        String draft =
                json.writeValueAsString(
                        Map.of(
                                "base_version",
                                1,
                                "draft_revision",
                                2,
                                "title",
                                "Редактор — новая версия",
                                "slides",
                                draftSlides));
        mvc.perform(
                        put("/api/generation/v1/presentations/{id}/editor/draft", id)
                                .with(csrf())
                                .contentType("application/json")
                                .content(draft))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.draft_revision").value(3));
        assertThat(service.get(USER, id).version()).isEqualTo(1);
        assertThat(service.versions(USER, id)).hasSize(1);
        mvc.perform(
                        put("/api/generation/v1/presentations/{id}/editor/draft", id)
                                .with(csrf())
                                .contentType("application/json")
                                .content(draft))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("edit_expired"));

        mvc.perform(
                        post("/api/generation/v1/presentations/{id}/editor/commit", id)
                                .with(csrf())
                                .contentType("application/json")
                                .content("{\"base_version\":1,\"draft_revision\":3}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.version").value(2));
        assertThat(service.versions(USER, id)).hasSize(2);
        assertThat(Files.readAllBytes(service.downloadVersion(USER, id, 1))).isEqualTo(original);
        try (var show =
                new XMLSlideShow(
                        new ByteArrayInputStream(Files.readAllBytes(service.download(USER, id))))) {
            assertThat(show.getSlides()).hasSize(2);
            assertThat(show.getSlides().getFirst().isHidden()).isTrue();
            assertThat(show.getSlides().getLast().isHidden()).isFalse();
            String closing =
                    show.getSlides().getFirst().getShapes().stream()
                            .filter(org.apache.poi.xslf.usermodel.XSLFTextShape.class::isInstance)
                            .map(org.apache.poi.xslf.usermodel.XSLFTextShape.class::cast)
                            .map(org.apache.poi.xslf.usermodel.XSLFTextShape::getText)
                            .collect(java.util.stream.Collectors.joining("\n"));
            assertThat(closing).contains("Добавленный текст");
            assertThat(show.getSlides().getFirst().getShapes())
                    .anyMatch(org.apache.poi.xslf.usermodel.XSLFPictureShape.class::isInstance);
            assertThat(
                            show.getSlides().getFirst().getShapes().stream()
                                    .filter(
                                            org.apache.poi.xslf.usermodel.XSLFTextShape.class
                                                    ::isInstance)
                                    .map(org.apache.poi.xslf.usermodel.XSLFTextShape.class::cast)
                                    .map(org.apache.poi.xslf.usermodel.XSLFTextShape::getAnchor)
                                    .filter(java.util.Objects::nonNull)
                                    .mapToDouble(java.awt.geom.Rectangle2D::getX))
                    .anyMatch(
                            x ->
                                    Math.abs(
                                                    x
                                                            - show.getCTPresentation()
                                                                            .getSldSz()
                                                                            .getCx()
                                                                    / 12_700.0
                                                                    * 0.20)
                                            < 0.1);
            String cover =
                    show.getSlides().getLast().getShapes().stream()
                            .filter(org.apache.poi.xslf.usermodel.XSLFTextShape.class::isInstance)
                            .map(org.apache.poi.xslf.usermodel.XSLFTextShape.class::cast)
                            .map(org.apache.poi.xslf.usermodel.XSLFTextShape::getText)
                            .collect(java.util.stream.Collectors.joining("\n"));
            assertThat(cover).contains("Новый заголовок");
        }
        mvc.perform(get("/api/generation/v1/presentations/{id}/editor", id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.base_version").value(2))
                .andExpect(jsonPath("$.draft_revision").value(4))
                .andExpect(
                        jsonPath("$.slides[0].blocks[?(@.id == 'text-editor-test')].text")
                                .value("Добавленный текст"))
                .andExpect(
                        jsonPath("$.slides[0].images[?(@.id == 'image-editor-test')].alt")
                                .value("Тестовая точка"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void editorApiKeepsMultiParagraphTextShapeOrderedThroughCommit() throws Exception {
        Map<String, String> fields = new LinkedHashMap<>();
        templates.fields("opal").keySet().forEach(field -> fields.put(field, "Текст " + field));
        for (int number = 1; number <= 5; number++) fields.put("LIST_" + number, "Пункт " + number);
        var decisions =
                java.util.stream.IntStream.rangeClosed(1, 13)
                        .mapToObj(
                                number ->
                                        new PresentationContent.Slide(
                                                number, number == 9, "Multi-paragraph editor test"))
                        .toList();
        UUID id = create(USER, "opal", "Список", "manual", null, null).id();
        service.submitManual(USER, id, new PresentationContent(fields, decisions));
        prepareAndPublish();

        String editorJson =
                mvc.perform(get("/api/generation/v1/presentations/{id}/editor", id))
                        .andExpect(status().isOk())
                        .andExpect(jsonPath("$.slides.length()").value(1))
                        .andReturn()
                        .getResponse()
                        .getContentAsString();
        var editor = json.readTree(editorJson);
        List<Map<String, Object>> loadedBlocks =
                json.convertValue(
                        editor.path("slides").get(0).path("blocks"),
                        new tools.jackson.core.type.TypeReference<List<Map<String, Object>>>() {});
        var listBlocks =
                loadedBlocks.stream()
                        .filter(block -> ((String) block.get("field_key")).matches("LIST_\\d+"))
                        .toList();

        assertThat(listBlocks).hasSize(5);
        assertThat(editor.path("slides").get(0).path("background_url").asText())
                .startsWith("/api/generation/v1/templates/opal/slides/9/background.png?v=");
        mvc.perform(get(editor.path("slides").get(0).path("background_url").asText()))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.IMAGE_PNG))
                .andExpect(header().string("Cache-Control", "max-age=3600, private"));
        assertThat(listBlocks)
                .extracting(block -> block.get("layout_id"))
                .containsOnly(listBlocks.getFirst().get("layout_id"));
        assertThat(listBlocks)
                .extracting(block -> ((Map<String, Object>) block.get("paragraph")).get("index"))
                .containsExactly(0, 1, 2, 3, 4);
        assertThat(listBlocks)
                .allSatisfy(
                        block ->
                                assertThat(
                                                ((Map<String, Object>) block.get("paragraph"))
                                                        .get("bullet"))
                                        .isEqualTo("—"));

        List<Map<String, Object>> draftBlocks = new ArrayList<>();
        List<Map<String, Object>> layouts = new ArrayList<>();
        var layoutIds = new java.util.LinkedHashSet<String>();
        for (var block : loadedBlocks) {
            String field = (String) block.get("field_key");
            draftBlocks.add(
                    Map.of(
                            "field_key",
                            field,
                            "text",
                            "LIST_3".equals(field)
                                    ? "Обновлённый третий пункт"
                                    : block.get("text")));
            String layoutId = (String) block.get("layout_id");
            if (layoutIds.add(layoutId))
                layouts.add(
                        Map.of(
                                "id", layoutId,
                                "x", block.get("x"),
                                "y", block.get("y"),
                                "width", block.get("width"),
                                "height", block.get("height")));
        }
        Map<String, Object> loadedSlide =
                json.convertValue(
                        editor.path("slides").get(0),
                        new tools.jackson.core.type.TypeReference<Map<String, Object>>() {});
        String draft =
                json.writeValueAsString(
                        Map.of(
                                "base_version",
                                1,
                                "draft_revision",
                                2,
                                "title",
                                "Список",
                                "slides",
                                List.of(
                                        Map.of(
                                                "source_slide_number",
                                                9,
                                                "name",
                                                loadedSlide.get("name"),
                                                "hidden",
                                                false,
                                                "blocks",
                                                draftBlocks,
                                                "layouts",
                                                layouts,
                                                "custom_blocks",
                                                List.of(),
                                                "images",
                                                List.of()))));
        mvc.perform(
                        put("/api/generation/v1/presentations/{id}/editor/draft", id)
                                .with(csrf())
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(draft))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.draft_revision").value(3));
        mvc.perform(
                        post("/api/generation/v1/presentations/{id}/editor/commit", id)
                                .with(csrf())
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"base_version\":1,\"draft_revision\":3}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.version").value(2));

        try (var show =
                new XMLSlideShow(
                        new ByteArrayInputStream(Files.readAllBytes(service.download(USER, id))))) {
            var listShape =
                    show.getSlides().getFirst().getShapes().stream()
                            .filter(org.apache.poi.xslf.usermodel.XSLFTextShape.class::isInstance)
                            .map(org.apache.poi.xslf.usermodel.XSLFTextShape.class::cast)
                            .filter(shape -> shape.getText().contains("Обновлённый третий пункт"))
                            .findFirst()
                            .orElseThrow();
            assertThat(listShape.getTextParagraphs())
                    .extracting(org.apache.poi.xslf.usermodel.XSLFTextParagraph::getText)
                    .containsExactly(
                            "Пункт 1", "Пункт 2", "Обновлённый третий пункт", "Пункт 4", "Пункт 5");
        }
    }

    @Test
    void generatedContentIsEditableBeforeItsFirstPublicationAndCommitReplayIsSafe()
            throws Exception {
        var content = typedPlan("Initial AI title");
        when(generator.generate(any(), anyString(), anyMap(), anyList(), anyString()))
                .thenReturn(content);
        UUID id = create(USER, "aurora", "Review before publishing", "openai", null, null).id();
        worker.processOne();
        assertThat(service.get(USER, id).status()).isEqualTo(PresentationStatus.DRAFT);
        assertThat(service.get(USER, id).version()).isZero();
        assertThat(service.get(USER, id).downloadUrl()).isNull();
        assertThat(service.versions(USER, id)).isEmpty();
        mvc.perform(get("/api/generation/v1/presentations/{id}/download", id))
                .andExpect(status().isNotFound());
        var deck = editor.get(USER, id);
        assertThat(deck.baseVersion()).isZero();
        mvc.perform(get("/api/generation/v1/presentations/{id}/editor", id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.base_version").value(0));
        var request = snapshot(deck);
        var savedBody =
                mvc.perform(
                                put("/api/generation/v1/presentations/{id}/editor/draft", id)
                                        .with(csrf())
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content(json.writeValueAsString(request)))
                        .andExpect(status().isOk())
                        .andExpect(jsonPath("$.base_version").value(0))
                        .andReturn()
                        .getResponse()
                        .getContentAsString();
        var saved = json.readValue(savedBody, EditorDraftSavedView.class);
        assertThat(saved.baseVersion()).isZero();
        assertThat(service.versions(USER, id)).isEmpty();
        assertThat(
                        db.queryForObject(
                                "SELECT output_path FROM generated_presentations WHERE id=?",
                                String.class,
                                id))
                .isNull();
        mvc.perform(
                        post("/api/generation/v1/presentations/{id}/editor/commit", id)
                                .with(csrf())
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        json.writeValueAsString(
                                                Map.of(
                                                        "base_version",
                                                        0,
                                                        "draft_revision",
                                                        saved.draftRevision()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.version").value(1));
        var result = service.get(USER, id);
        assertThat(result.version()).isEqualTo(1);
        assertThat(result.status()).isEqualTo(PresentationStatus.SUCCEEDED);
        assertThat(editor.commit(USER, id, 0, saved.draftRevision()).version()).isEqualTo(1);
        assertThat(service.versions(USER, id)).hasSize(1);
        assertThat(service.download(USER, id)).exists();
        verify(generator, times(1)).generate(any(), anyString(), anyMap(), anyList(), anyString());
        mvc.perform(get("/api/generation/v1/presentations/{id}/editor", id))
                .andExpect(jsonPath("$.base_version").value(1));
    }

    @Test
    void queuedAiContentSurvivesReviewMigrationWithoutAnotherProviderCall() throws Exception {
        UUID id =
                create(USER, "aurora", "Already generated before migration", "openai", null, null)
                        .id();
        String prepared =
                codec.encode(
                        templates.normalize("aurora", typedPlan("Previously confirmed content")));
        db.update("UPDATE generated_presentations SET content_json=? WHERE id=?", prepared, id);
        worker.processOne();
        assertThat(service.get(USER, id).status()).isEqualTo(PresentationStatus.DRAFT);
        assertThat(
                        db.queryForObject(
                                "SELECT content_json FROM generated_presentations WHERE id=?",
                                String.class,
                                id))
                .isEqualTo(prepared);
        assertThat(service.versions(USER, id)).isEmpty();
        verify(generator, never()).generate(any(), anyString(), anyMap(), anyList(), anyString());
        verify(generator, never())
                .generate(any(), anyString(), anyMap(), anyList(), anyString(), any());
    }

    @Test
    void lateGenerationCallbacksCannotOverwriteADraftOrItsPublishedVersion() throws Exception {
        UUID id = createManual();
        service.submitManual(USER, id, typedPlan("Manual draft"));
        var claim = transactions.claim().orElseThrow();
        transactions.prepareDraft(claim, claim.contentJson());
        transactions.fail(claim, "late_failure");
        assertThat(service.get(USER, id).status()).isEqualTo(PresentationStatus.DRAFT);
        assertThatThrownBy(() -> transactions.prepareDraft(claim, claim.contentJson()))
                .isInstanceOf(GenerationException.class);
        var saved = editor.save(USER, id, snapshot(editor.get(USER, id)));
        editor.commit(USER, id, 0, saved.draftRevision());
        transactions.fail(claim, "later_failure");
        assertThat(service.get(USER, id).status()).isEqualTo(PresentationStatus.SUCCEEDED);
        assertThat(service.versions(USER, id)).hasSize(1);
    }

    @Test
    void cancellationCannotRaceAnActiveFirstCommitOrAcceptItsExpiredLateResult() throws Exception {
        UUID id = createManual();
        service.submitManual(USER, id, typedPlan("Cancel draft"));
        worker.processOne();
        var saved = editor.save(USER, id, snapshot(editor.get(USER, id)));
        var commit = transactions.beginEditorCommit(USER, id, 0, saved.draftRevision());
        assertThatThrownBy(() -> service.cancel(USER, id))
                .extracting(e -> ((GenerationException) e).code())
                .isEqualTo("edit_in_progress");
        db.update(
                "UPDATE generated_presentations SET edit_started_at=now()-interval '1 day' WHERE"
                        + " id=?",
                id);
        service.cancel(USER, id);
        assertThatThrownBy(
                        () -> transactions.completeEditorCommit(commit, "{}", "never-written", 1))
                .extracting(e -> ((GenerationException) e).code())
                .isEqualTo("edit_expired");
        assertThat(service.get(USER, id).status()).isEqualTo(PresentationStatus.CANCELLED);
        assertThat(service.versions(USER, id)).isEmpty();
    }

    private PresentationView create(
            UUID owner, String template, String topic, String mode, String key, String model) {
        return create(owner, template, topic, mode, key, model, null, null, null);
    }

    private PresentationView create(
            UUID owner,
            String template,
            String topic,
            String mode,
            String key,
            String model,
            String goal,
            String audience,
            SourceMaterial source) {
        return service.create(owner, template, topic, mode, key, model, goal, audience, source);
    }

    /** Existing published-document regressions explicitly publish their generated fixture first. */
    private void prepareAndPublish() throws Exception {
        worker.processOne();
        for (var row :
                db.queryForList(
                        "SELECT id,user_id FROM generated_presentations WHERE status='draft'")) {
            UUID id = (UUID) row.get("id");
            UUID owner = (UUID) row.get("user_id");
            var deck = editor.get(owner, id);
            var saved = editor.save(owner, id, snapshot(deck));
            editor.commit(owner, id, saved.baseVersion(), saved.draftRevision());
        }
    }

    private SaveEditorDraftRequest snapshot(EditorDeckView deck) {
        return new SaveEditorDraftRequest(
                deck.baseVersion(),
                deck.draftRevision(),
                deck.title(),
                deck.slides().stream()
                        .map(
                                slide -> {
                                    var fields =
                                            slide.blocks().stream()
                                                    .filter(b -> b.fieldKey() != null)
                                                    .map(
                                                            b ->
                                                                    new SaveEditorDraftRequest
                                                                            .TextBlock(
                                                                            b.fieldKey(), b.text()))
                                                    .toList();
                                    var custom =
                                            slide.blocks().stream()
                                                    .filter(b -> b.fieldKey() == null)
                                                    .map(
                                                            b ->
                                                                    new SaveEditorDraftRequest
                                                                            .CustomTextBlock(
                                                                            b.id(),
                                                                            b.text(),
                                                                            b.x(),
                                                                            b.y(),
                                                                            b.width(),
                                                                            b.height(),
                                                                            b.fontSize(),
                                                                            b.weight(),
                                                                            b.align(),
                                                                            b.color()))
                                                    .toList();
                                    var images =
                                            slide.images().stream()
                                                    .map(
                                                            i ->
                                                                    new SaveEditorDraftRequest
                                                                            .ImageBlock(
                                                                            i.id(),
                                                                            i.assetId(),
                                                                            i.alt(),
                                                                            i.x(),
                                                                            i.y(),
                                                                            i.width(),
                                                                            i.height()))
                                                    .toList();
                                    var layouts =
                                            new LinkedHashMap<
                                                    String, SaveEditorDraftRequest.TextLayout>();
                                    slide.blocks().stream()
                                            .filter(b -> b.layoutId() != null)
                                            .forEach(
                                                    b ->
                                                            layouts.putIfAbsent(
                                                                    b.layoutId(),
                                                                    new SaveEditorDraftRequest
                                                                            .TextLayout(
                                                                            b.layoutId(),
                                                                            b.x(),
                                                                            b.y(),
                                                                            b.width(),
                                                                            b.height())));
                                    return new SaveEditorDraftRequest.Slide(
                                            slide.sourceSlideNumber(),
                                            slide.name(),
                                            slide.hidden(),
                                            fields,
                                            custom,
                                            images,
                                            List.copyOf(layouts.values()));
                                })
                        .toList());
    }

    private UUID readyManual() throws Exception {
        UUID id = createManual();
        service.submitManual(USER, id, typedPlan("Исходный план"));
        prepareAndPublish();
        assertThat(service.get(USER, id).status()).isEqualTo(PresentationStatus.SUCCEEDED);
        return id;
    }

    private static byte[] png() throws Exception {
        var image =
                new java.awt.image.BufferedImage(2, 2, java.awt.image.BufferedImage.TYPE_INT_RGB);
        image.setRGB(0, 0, 0x335cc5);
        var output = new java.io.ByteArrayOutputStream();
        javax.imageio.ImageIO.write(image, "png", output);
        return output.toByteArray();
    }

    private PresentationContent typedPlan(String title) {
        return codec.decode(json.writeValueAsString(plan(title)));
    }

    private Map<String, Object> plan(String title) {
        Map<String, String> fields = new LinkedHashMap<>();
        templates.fields().keySet().forEach(field -> fields.put(field, "Текст"));
        fields.put("TITLE", title);
        List<Map<String, Object>> slides = new ArrayList<>();
        for (int number = 1; number <= templates.slideManifest().size(); number++)
            slides.add(Map.of("slide", number, "include", number == 1, "reason", "Test selection"));
        Map<String, Object> plan = new LinkedHashMap<>();
        plan.put("fields", fields);
        plan.put("slides", slides);
        return plan;
    }
}
