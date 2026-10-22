package ru.godeck.presentation.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
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
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import ru.godeck.presentation.ai.PresentationContentGenerator;
import ru.godeck.presentation.dto.PresentationView;
import ru.godeck.presentation.exception.GenerationException;
import ru.godeck.presentation.mapper.PresentationContentCodec;
import ru.godeck.presentation.model.PresentationContent;
import ru.godeck.presentation.model.PresentationStatus;
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
    @Autowired PlatformTransactionManager transactionManager;
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
        worker.processOne();
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
        verify(generator, never()).generate(anyString(), anyMap(), anyList(), anyString());
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
        when(generator.generate(anyString(), anyMap(), anyList(), anyString()))
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
        when(generator.generate(anyString(), anyMap(), anyList(), anyString()))
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
                .generate(anyString(), anyMap(), anyList(), anyString());
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
        verify(generator, never()).generate(anyString(), anyMap(), anyList(), anyString());
    }

    @Test
    void idempotencyKeyIncludesTheChosenModeAndUnknownModesAreRejected() throws Exception {
        String key = UUID.randomUUID().toString();
        var first = service.create(USER, "aurora", "Один и тот же запрос", "manual", key, null);
        assertThat(service.create(USER, "aurora", "Один и тот же запрос", "manual", key, null))
                .isEqualTo(first);
        assertThat(
                        assertThrows(
                                        GenerationException.class,
                                        () ->
                                                service.create(
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
                                                service.create(
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
                                                service.create(
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
        when(generator.generate(anyString(), anyMap(), anyList(), anyString()))
                .thenReturn(typedPlan("План выступления"));
        var created =
                service.create(
                        USER,
                        "aurora",
                        "Презентация с выбранной моделью",
                        "openai",
                        null,
                        "gpt-6-luna");
        UUID id = created.id();
        assertThat(created.model()).isEqualTo("gpt-6-luna");
        worker.processOne();
        verify(generator).generate(anyString(), anyMap(), anyList(), eq("gpt-6-luna"));
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
        verify(generator, times(2)).generate(anyString(), anyMap(), anyList(), eq("gpt-6-astra"));
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
        when(generator.generate(anyString(), anyMap(), anyList(), anyString()))
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
        verify(generator, times(1)).generate(anyString(), anyMap(), anyList(), anyString());
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
        verify(generator, never()).generate(anyString(), anyMap(), anyList(), anyString());
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
                    return service.create(
                            USER, "aurora", "Один конкурентный запрос", "manual", key, null);
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
        worker.processOne();
        assertThat(service.get(USER, id).status()).isEqualTo(PresentationStatus.CANCELLED);
        assertThat(service.versions(USER, id)).isEmpty();
        verify(generator, never()).generate(anyString(), anyMap(), anyList(), anyString());
    }

    @Test
    void obsoleteModelFailsItsJobWithoutBlockingTheNextJob() throws Exception {
        UUID obsolete = service.create(USER, "aurora", "Old model", "openai", null, null).id();
        db.update("UPDATE generated_presentations SET model='retired-model' WHERE id=?", obsolete);
        UUID next = createManual();
        service.submitManual(USER, next, typedPlan("Next job"));
        // Fix queue order explicitly rather than relying on wall-clock precision.
        db.update(
                "UPDATE generated_presentations SET created_at=now()-interval '1 minute' WHERE"
                        + " id=?",
                obsolete);
        worker.processOne();
        assertThat(service.get(USER, obsolete).status()).isEqualTo(PresentationStatus.FAILED);
        assertThat(service.get(USER, obsolete).errorCode()).isEqualTo("unsupported_model");
        worker.processOne();
        assertThat(service.get(USER, next).status()).isEqualTo(PresentationStatus.SUCCEEDED);
        verify(generator, never()).generate(anyString(), anyMap(), anyList(), anyString());
    }

    @Test
    void providerFailureDoesNotLeaveARevisionAndTheWorkerRemainsUsable() throws Exception {
        UUID failed = service.create(USER, "aurora", "Provider failure", "openai", null, null).id();
        when(generator.generate(anyString(), anyMap(), anyList(), anyString()))
                .thenThrow(new IllegalStateException("provider failed"));
        worker.processOne();
        assertThat(service.get(USER, failed).status()).isEqualTo(PresentationStatus.FAILED);
        assertThat(service.get(USER, failed).errorCode()).isEqualTo("generation_failed");
        assertThat(service.versions(USER, failed)).isEmpty();
        UUID next = createManual();
        service.submitManual(USER, next, typedPlan("Recovery"));
        worker.processOne();
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
                                        () -> transactions.complete(job, "{}", "never-written", 1))
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
        when(generator.generate(anyString(), anyMap(), anyList(), anyString()))
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
        var first = service.create(USER, "aurora", "One", "manual", key, null);
        service.create(USER, "aurora", "Two", "manual", null, null);
        service.create(USER, "aurora", "Three", "manual", null, null);
        assertThat(
                        assertThrows(
                                        GenerationException.class,
                                        () ->
                                                service.create(
                                                        USER, "aurora", "Four", "manual", null,
                                                        null))
                                .code())
                .isEqualTo("generation_limit");
        assertThat(service.create(USER, "aurora", "One", "manual", key, null).id())
                .isEqualTo(first.id());
        service.cancel(USER, first.id());
        assertThat(service.create(USER, "aurora", "Replacement", "manual", null, null)).isNotNull();
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
        worker.processOne();
        assertThat(service.get(USER, id).status()).isEqualTo(PresentationStatus.SUCCEEDED);
        verify(generator, never()).generate(anyString(), anyMap(), anyList(), anyString());
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

    private UUID readyManual() throws Exception {
        UUID id = createManual();
        service.submitManual(USER, id, typedPlan("Исходный план"));
        worker.processOne();
        assertThat(service.get(USER, id).status()).isEqualTo(PresentationStatus.SUCCEEDED);
        return id;
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
