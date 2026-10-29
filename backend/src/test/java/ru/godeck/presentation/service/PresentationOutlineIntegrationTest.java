package ru.godeck.presentation.service;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import org.apache.poi.xslf.usermodel.XMLSlideShow;
import org.apache.poi.xslf.usermodel.XSLFTextShape;
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

import ru.godeck.presentation.ai.PresentationContentGenerator;
import ru.godeck.presentation.dto.ConfirmPresentationOutlineRequest;
import ru.godeck.presentation.dto.PresentationOutlineView;
import ru.godeck.presentation.dto.SavePresentationOutlineRequest;
import ru.godeck.presentation.exception.GenerationException;
import ru.godeck.presentation.mapper.PresentationContentCodec;
import ru.godeck.presentation.material.MaterialRetention;
import ru.godeck.presentation.model.GenerationInput;
import ru.godeck.presentation.model.GenerationMode;
import ru.godeck.presentation.model.PresentationContent;
import ru.godeck.presentation.model.PresentationStatus;
import ru.godeck.presentation.model.SourceMaterial;
import ru.godeck.presentation.template.PresentationTemplateService;
import ru.godeck.presentation.worker.PresentationWorker;

import tools.jackson.databind.ObjectMapper;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

@SpringBootTest(
        properties = {
            "godeck.auth.dev-bypass=true", "godeck.generation.poll-ms=86400000",
            "spring.datasource.hikari.schema=outline_test",
                    "spring.flyway.default-schema=outline_test",
            "spring.flyway.schemas=outline_test"
        })
@AutoConfigureMockMvc
class PresentationOutlineIntegrationTest {
    private static final UUID OWNER =
            UUID.nameUUIDFromBytes("godeck-local-debug-user".getBytes(StandardCharsets.UTF_8));
    private static final Path OUTPUT =
            Path.of(
                    System.getProperty("java.io.tmpdir"),
                    "godeck-outline-test-" + UUID.randomUUID());
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate db;
    @Autowired ObjectMapper json;
    @Autowired PresentationService service;
    @Autowired PresentationOutlineService outlines;
    @Autowired PresentationWorker worker;
    @Autowired PresentationTransactions transactions;
    @Autowired PresentationTemplateService templates;
    @Autowired PresentationContentCodec codec;
    @Autowired MaterialRetention retention;
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
                () -> database.replace("currentSchema=auth_test", "currentSchema=outline_test"));
        properties.add("godeck.generation.data-dir", OUTPUT::toString);
    }

    @BeforeEach
    void clean() {
        db.update("DELETE FROM generated_presentations");
        when(generator.enabled()).thenReturn(true);
        when(generator.generate(any(), anyString(), anyMap(), anyList(), anyString()))
                .thenReturn(plan());
        when(generator.generate(
                        any(),
                        anyString(),
                        anyMap(),
                        anyList(),
                        anyString(),
                        any(GenerationInput.class)))
                .thenReturn(plan());
    }

    @AfterAll
    static void cleanFiles() throws Exception {
        if (Files.exists(OUTPUT))
            try (var paths = Files.walk(OUTPUT)) {
                for (var path : paths.sorted(Comparator.reverseOrder()).toList())
                    Files.deleteIfExists(path);
            }
    }

    @Test
    void oneAiCallPausesBeforeFilesThenExactReviewedContentIsRenderedAsVersionOne()
            throws Exception {
        UUID id = firstPhase(true);
        assertThat(service.get(OWNER, id).status()).isEqualTo(PresentationStatus.AWAITING_REVIEW);
        assertThat(service.get(OWNER, id).mode()).isEqualTo(GenerationMode.OPENAI);
        assertThat(service.get(OWNER, id).downloadUrl()).isNull();
        assertThat(service.versions(OWNER, id)).isEmpty();
        mvc.perform(get("/api/generation/v1/presentations/{id}/download", id))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/generation/v1/presentations/{id}/editor", id))
                .andExpect(status().isConflict());
        mvc.perform(get("/api/generation/v1/presentations/{id}/outline", id))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.revision").value(1))
                .andExpect(jsonPath("$.slides.length()").value(13));
        var original = outlines.get(OWNER, id);
        var rows = new ArrayList<>(decisions(original));
        var closing = rows.removeLast();
        rows.addFirst(closing);
        rows.replaceAll(
                row ->
                        new SavePresentationOutlineRequest.Slide(
                                row.sourceSlideNumber(),
                                row.sourceSlideNumber() == 1 || row.sourceSlideNumber() == 13,
                                row.sourceSlideNumber() == 1
                                        ? "Проверенная обложка"
                                        : row.title()));
        var saved = outlines.save(OWNER, id, new SavePresentationOutlineRequest(1, rows));
        assertThat(saved.revision()).isEqualTo(2);
        assertThat(outlines.get(OWNER, id)).isEqualTo(saved);
        mvc.perform(
                        post("/api/generation/v1/presentations/{id}/outline/confirm", id)
                                .with(csrf())
                                .contentType("application/json")
                                .content("{\"revision\":2}"))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.status").value("queued"));
        worker.processOne();
        assertThat(service.get(OWNER, id).status()).isEqualTo(PresentationStatus.SUCCEEDED);
        assertThat(service.versions(OWNER, id)).hasSize(1);
        try (var deck =
                new XMLSlideShow(
                        new ByteArrayInputStream(
                                Files.readAllBytes(service.download(OWNER, id))))) {
            assertThat(deck.getSlides()).hasSize(2);
            assertThat(slideText(deck, 0)).contains("CLOSING_TITLE");
            assertThat(slideText(deck, 1)).contains("Проверенная обложка");
            assertThat(slideText(deck, 0) + slideText(deck, 1)).doesNotContain("LIST_TITLE");
        }
        verify(generator, times(1))
                .generate(
                        any(),
                        anyString(),
                        anyMap(),
                        anyList(),
                        anyString(),
                        any(GenerationInput.class));
        verify(generator, never()).generate(any(), anyString(), anyMap(), anyList(), anyString());
        assertThat(outlines.confirm(OWNER, id, new ConfirmPresentationOutlineRequest(2)).status())
                .isEqualTo(PresentationStatus.SUCCEEDED);
        worker.processOne();
        assertThat(service.versions(OWNER, id)).hasSize(1);
        mvc.perform(get("/api/generation/v1/presentations/{id}/outline", id))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("outline_closed"));
    }

    @Test
    void concurrentConfirmAndLateFirstPhaseCallbacksCannotDuplicateOrFailTheRenderPhase()
            throws Exception {
        UUID id = create(false);
        var firstClaim = transactions.claim().orElseThrow();
        transactions.awaitReview(firstClaim, codec.encode(plan()));
        var first =
                CompletableFuture.supplyAsync(
                        () ->
                                outlines.confirm(
                                        OWNER, id, new ConfirmPresentationOutlineRequest(1)));
        var second =
                CompletableFuture.supplyAsync(
                        () ->
                                outlines.confirm(
                                        OWNER, id, new ConfirmPresentationOutlineRequest(1)));
        assertThat(first.get(10, TimeUnit.SECONDS).id()).isEqualTo(id);
        assertThat(second.get(10, TimeUnit.SECONDS).id()).isEqualTo(id);
        var renderClaim = transactions.claim().orElseThrow();
        assertThat(renderClaim.renderConfirmedOutline()).isTrue();
        transactions.fail(firstClaim, "late_failure");
        assertThat(service.get(OWNER, id).status()).isEqualTo(PresentationStatus.RUNNING);
        assertThatThrownBy(() -> transactions.awaitReview(firstClaim, codec.encode(plan())))
                .isInstanceOf(GenerationException.class);
        assertThatThrownBy(
                        () ->
                                transactions.complete(
                                        firstClaim, codec.encode(plan()), "not-a-file", 3))
                .isInstanceOf(GenerationException.class);
        assertThat(outlines.confirm(OWNER, id, new ConfirmPresentationOutlineRequest(1)).status())
                .isEqualTo(PresentationStatus.RUNNING);
        transactions.fail(renderClaim, "test_finished");
        assertThatThrownBy(
                        () -> outlines.confirm(OWNER, id, new ConfirmPresentationOutlineRequest(1)))
                .isInstanceOfSatisfying(
                        GenerationException.class,
                        error -> assertThat(error.code()).isEqualTo("outline_closed"));
    }

    @Test
    void invalidUnknownAndFractionalChangesAreRejectedWithoutASecondAiCall() throws Exception {
        UUID id = firstPhase(false);
        var original = outlines.get(OWNER, id);
        var base =
                json.readTree(
                        json.writeValueAsString(
                                new SavePresentationOutlineRequest(1, decisions(original))));
        var body = (tools.jackson.databind.node.ObjectNode) base.deepCopy();
        body.put("fields", "attempted full content mutation");
        mvc.perform(
                        put("/api/generation/v1/presentations/{id}/outline", id)
                                .with(csrf())
                                .contentType("application/json")
                                .content(json.writeValueAsString(body)))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.error.code").value("invalid_outline"));
        mvc.perform(
                        put("/api/generation/v1/presentations/{id}/outline", id)
                                .with(csrf())
                                .contentType("application/json")
                                .content("{\"revision\":1.5,\"slides\":[]}"))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.error.code").value("invalid_outline"));
        mvc.perform(
                        put("/api/generation/v1/presentations/{id}/outline", id)
                                .contentType("application/json")
                                .content(json.writeValueAsString(base)))
                .andExpect(status().isForbidden());
        mvc.perform(
                        post("/api/generation/v1/presentations/{id}/outline/confirm", id)
                                .contentType("application/json")
                                .content("{\"revision\":1}"))
                .andExpect(status().isForbidden());
        assertThat(outlines.get(OWNER, id)).isEqualTo(original);
        var changed = new ArrayList<>(decisions(original));
        var cover = changed.getFirst();
        changed.set(
                0,
                new SavePresentationOutlineRequest.Slide(
                        cover.sourceSlideNumber(), cover.include(), "Правка"));
        outlines.save(OWNER, id, new SavePresentationOutlineRequest(1, changed));
        mvc.perform(
                        post("/api/generation/v1/presentations/{id}/outline/confirm", id)
                                .with(csrf())
                                .contentType("application/json")
                                .content("{\"revision\":1}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("outline_conflict"));
        assertThatThrownBy(() -> outlines.get(UUID.randomUUID(), id))
                .isInstanceOfSatisfying(
                        GenerationException.class,
                        error -> assertThat(error.status()).isEqualTo(404));
        verify(generator, times(1)).generate(any(), anyString(), anyMap(), anyList(), anyString());
    }

    @Test
    void awaitingReviewCountsAsActiveCanBeCancelledAndDoesNotExpireSourceEarly() throws Exception {
        UUID id = firstPhase(true);
        assertThat(
                        db.queryForObject(
                                "SELECT generation_input_expires_at FROM generated_presentations"
                                        + " WHERE id=?",
                                java.sql.Timestamp.class,
                                id))
                .isNull();
        db.update(
                "UPDATE generated_presentations SET updated_at=now()-interval '40 days' WHERE id=?",
                id);
        assertThat(retention.clearExpired()).isZero();
        assertThat(
                        db.queryForObject(
                                "SELECT generation_input_json FROM generated_presentations WHERE"
                                        + " id=?",
                                String.class,
                                id))
                .contains("private source");
        firstPhase(false);
        firstPhase(false);
        assertThatThrownBy(() -> create(false))
                .isInstanceOfSatisfying(
                        GenerationException.class,
                        error -> assertThat(error.code()).isEqualTo("generation_limit"));
        service.cancel(OWNER, id);
        assertThat(service.get(OWNER, id).status()).isEqualTo(PresentationStatus.CANCELLED);
        assertThat(
                        db.queryForObject(
                                "SELECT generation_input_expires_at FROM generated_presentations"
                                        + " WHERE id=?",
                                java.sql.Timestamp.class,
                                id))
                .isNotNull();
        assertThatThrownBy(
                        () -> outlines.confirm(OWNER, id, new ConfirmPresentationOutlineRequest(1)))
                .isInstanceOfSatisfying(
                        GenerationException.class,
                        error -> assertThat(error.code()).isEqualTo("outline_closed"));
        assertThat(create(false)).isNotNull();
    }

    @Test
    void createReviewOptionParticipatesInHashAndCannotChangeManualMode() throws Exception {
        var original = service.create(OWNER, "opal", "Legacy", "openai", "outline-old-key", null);
        assertThat(
                        service.create(
                                        OWNER,
                                        "opal",
                                        "Legacy",
                                        "openai",
                                        "outline-old-key",
                                        null,
                                        null,
                                        null,
                                        null,
                                        false)
                                .id())
                .isEqualTo(original.id());
        assertThatThrownBy(
                        () ->
                                service.create(
                                        OWNER,
                                        "opal",
                                        "Legacy",
                                        "openai",
                                        "outline-old-key",
                                        null,
                                        null,
                                        null,
                                        null,
                                        true))
                .isInstanceOfSatisfying(
                        GenerationException.class,
                        error -> assertThat(error.code()).isEqualTo("idempotency_conflict"));
        mvc.perform(
                        post("/api/generation/v1/presentations")
                                .with(csrf())
                                .contentType("application/json")
                                .content(
                                        "{\"template_id\":\"opal\",\"topic\":\"Manual"
                                            + " plan\",\"mode\":\"manual\",\"review_before_render\":true}"))
                .andExpect(status().isUnprocessableContent());
        worker.processOne();
        assertThat(service.get(OWNER, original.id()).status())
                .isEqualTo(PresentationStatus.SUCCEEDED);
    }

    @Test
    void everyOutlineEndpointReturnsNotFoundForAnotherOwnersPresentation() throws Exception {
        UUID foreignOwner = UUID.randomUUID();
        db.update(
                "INSERT INTO app_users(id,email,password_hash,consent_at,created_at)"
                        + " VALUES(?,?,?,now(),now())",
                foreignOwner,
                "outline-" + foreignOwner + "@example.test",
                "not-a-real-password-hash");
        UUID id =
                service.create(
                                foreignOwner,
                                "opal",
                                "Private review",
                                "openai",
                                null,
                                null,
                                null,
                                null,
                                null,
                                true)
                        .id();
        worker.processOne();
        var outline = outlines.get(foreignOwner, id);
        mvc.perform(get("/api/generation/v1/presentations/{id}/outline", id))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("presentation_not_found"));
        mvc.perform(
                        put("/api/generation/v1/presentations/{id}/outline", id)
                                .with(csrf())
                                .contentType("application/json")
                                .content(
                                        json.writeValueAsString(
                                                new SavePresentationOutlineRequest(
                                                        1, decisions(outline)))))
                .andExpect(status().isNotFound());
        mvc.perform(
                        post("/api/generation/v1/presentations/{id}/outline/confirm", id)
                                .with(csrf())
                                .contentType("application/json")
                                .content("{\"revision\":1}"))
                .andExpect(status().isNotFound());
        assertThat(outlines.get(foreignOwner, id)).isEqualTo(outline);
    }

    @Test
    void oldPendingReviewStaysOnFirstHistoryPageButCancelledJobsKeepChronologicalOrder()
            throws Exception {
        UUID pending = firstPhase(false);
        db.update(
                "UPDATE generated_presentations SET created_at=now()-interval '40 days' WHERE id=?",
                pending);
        UUID oldCancelled =
                service.create(OWNER, "opal", "Old cancelled", "manual", null, null).id();
        service.cancel(OWNER, oldCancelled);
        db.update(
                "UPDATE generated_presentations SET created_at=now()-interval '39 days' WHERE id=?",
                oldCancelled);
        var newestFirst = new ArrayList<UUID>();
        var recent = java.time.Instant.now().minusSeconds(60);
        for (int index = 0; index < 21; index++) {
            UUID id = UUID.randomUUID();
            db.update(
                    "INSERT INTO generated_presentations"
                        + " (id,user_id,template_id,topic,status,mode,request_hash,model,created_at,updated_at,current_version)"
                        + " VALUES(?,?, 'opal',?,?,'manual',?, 'gpt-6.1-sol',?,?,1)",
                    id,
                    OWNER,
                    "Recent job " + index,
                    index % 2 == 0 ? "cancelled" : "failed",
                    "a".repeat(64),
                    java.sql.Timestamp.from(recent.plusSeconds(index)),
                    java.sql.Timestamp.from(recent.plusSeconds(index)));
            newestFirst.addFirst(id);
        }
        var first = service.list(OWNER, 20, 0);
        assertThat(first.total()).isEqualTo(23);
        assertThat(first.items())
                .extracting(ru.godeck.presentation.dto.PresentationView::id)
                .containsExactlyElementsOf(
                        java.util.stream.Stream.concat(
                                        java.util.stream.Stream.of(pending),
                                        newestFirst.subList(0, 19).stream())
                                .toList());
        assertThat(service.list(OWNER, 20, 20).items())
                .extracting(ru.godeck.presentation.dto.PresentationView::id)
                .containsExactly(newestFirst.get(19), newestFirst.get(20), oldCancelled);
        mvc.perform(get("/api/generation/v1/presentations?limit=20&offset=0"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(23))
                .andExpect(jsonPath("$.items[0].id").value(pending.toString()));

        service.cancel(OWNER, pending);
        assertThat(service.list(OWNER, 20, 0).items())
                .extracting(ru.godeck.presentation.dto.PresentationView::id)
                .containsExactlyElementsOf(newestFirst.subList(0, 20));
        assertThat(service.list(OWNER, 20, 20).items())
                .extracting(ru.godeck.presentation.dto.PresentationView::id)
                .containsExactly(newestFirst.get(20), oldCancelled, pending);
    }

    private UUID firstPhase(boolean source) {
        UUID id = create(source);
        worker.processOne();
        return id;
    }

    private UUID create(boolean source) {
        return service.create(
                        OWNER,
                        "opal",
                        "Обзор результатов",
                        "openai",
                        null,
                        null,
                        null,
                        null,
                        source ? new SourceMaterial("txt", "source.txt", "private source") : null,
                        true)
                .id();
    }

    private List<SavePresentationOutlineRequest.Slide> decisions(PresentationOutlineView view) {
        return view.slides().stream()
                .map(
                        slide ->
                                new SavePresentationOutlineRequest.Slide(
                                        slide.sourceSlideNumber(),
                                        slide.include(),
                                        slide.titleFieldKey() == null ? null : slide.title()))
                .toList();
    }

    private PresentationContent plan() {
        var fields = new LinkedHashMap<String, String>();
        templates
                .fields("opal")
                .forEach(
                        (key, max) ->
                                fields.put(
                                        key,
                                        key.equals("FOOTER")
                                                ? "private footer"
                                                : key.substring(0, Math.min(key.length(), max))));
        var slides =
                templates.slideManifest("opal").stream()
                        .map(
                                entry -> {
                                    int number = ((Number) entry.get("slide")).intValue();
                                    return new PresentationContent.Slide(
                                            number,
                                            List.of(1, 9, 13).contains(number),
                                            "Полезный слайд");
                                })
                        .toList();
        return templates.normalize("opal", new PresentationContent(fields, slides));
    }

    private static String slideText(XMLSlideShow show, int index) {
        return show.getSlides().get(index).getShapes().stream()
                .filter(XSLFTextShape.class::isInstance)
                .map(XSLFTextShape.class::cast)
                .map(XSLFTextShape::getText)
                .collect(java.util.stream.Collectors.joining("\n"));
    }
}
