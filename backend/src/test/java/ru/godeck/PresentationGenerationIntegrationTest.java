package ru.godeck;

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
import tools.jackson.databind.ObjectMapper;

import static java.nio.charset.StandardCharsets.UTF_8;
import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {
        "godeck.auth.dev-bypass=true",
        "godeck.generation.poll-ms=86400000",
        "spring.datasource.hikari.schema=generation_test",
        "spring.flyway.default-schema=generation_test",
        "spring.flyway.schemas=generation_test"
})
@AutoConfigureMockMvc
class PresentationGenerationIntegrationTest {
    static final UUID USER = UUID.nameUUIDFromBytes("godeck-local-debug-user".getBytes(UTF_8));
    static final Path OUTPUT = Path.of(System.getProperty("java.io.tmpdir"), "godeck-generation-test-" + UUID.randomUUID());
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate db;
    @Autowired ObjectMapper json;
    @Autowired PresentationTemplateService templates;
    @Autowired PresentationGenerationService service;
    @Autowired PlatformTransactionManager transactionManager;
    @MockitoBean PresentationContentGenerator generator;

    @DynamicPropertySource static void configuration(DynamicPropertyRegistry properties) {
        String database = System.getenv().getOrDefault("TEST_DATABASE_URL", "jdbc:postgresql://127.0.0.1:5433/godeck?currentSchema=auth_test");
        properties.add("spring.datasource.url", () -> database.replace("currentSchema=auth_test", "currentSchema=generation_test"));
        properties.add("godeck.generation.data-dir", OUTPUT::toString);
    }

    @BeforeEach void clean() {
        db.update("DELETE FROM generated_presentations");
        when(generator.enabled()).thenReturn(true);
    }

    @AfterAll static void cleanFiles() throws Exception {
        if (Files.exists(OUTPUT)) try (var files = Files.walk(OUTPUT)) {
            for (Path file : files.sorted(java.util.Comparator.reverseOrder()).toList()) Files.deleteIfExists(file);
        }
    }

    @Test void manualPlanRendersAndDownloadsThroughTheAdvertisedUrlWithoutOpenAi() throws Exception {
        when(generator.enabled()).thenReturn(false);
        UUID id = createManual();
        mvc.perform(put("/api/generation/v1/presentations/{id}/content", id).with(csrf())
                        .contentType("application/json").content(json.writeValueAsString(plan("Квартальный план"))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("queued"));
        service.processOne();
        var presentation = service.get(USER, id);
        assertThat(presentation.get("status")).isEqualTo("succeeded");
        assertThat(presentation).doesNotContainKeys("request_hash", "output_path", "idempotency_key");
        byte[] bytes = mvc.perform(get((String) presentation.get("download_url")))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andReturn().getResponse().getContentAsByteArray();
        try (var show = new XMLSlideShow(new ByteArrayInputStream(bytes))) {
            assertThat(show.getSlides()).hasSize(1);
            String text = show.getSlides().getFirst().getShapes().stream()
                    .filter(org.apache.poi.xslf.usermodel.XSLFTextShape.class::isInstance)
                    .map(org.apache.poi.xslf.usermodel.XSLFTextShape.class::cast)
                    .map(org.apache.poi.xslf.usermodel.XSLFTextShape::getText)
                    .collect(java.util.stream.Collectors.joining("\n"));
            assertThat(text).contains("Квартальный план").doesNotContain("{{");
        }
        assertThat(service.versions(USER, id)).hasSize(1);
        verify(generator, never()).generate(anyString(), anyMap(), anyList());
        var notFound = assertThrows(PresentationGenerationService.GenerationException.class,
                () -> service.download(UUID.randomUUID(), id));
        assertThat(notFound.status()).isEqualTo(404);
    }

    @Test void rejectsDuplicateAndOutOfRangeSlideDecisionsBeforeQueueing() throws Exception {
        UUID id = createManual();
        for (Number index : List.of(1, 999, 1.5)) {
            var input = plan("Корректная тема");
            var decisions = new ArrayList<>((List<Map<String,Object>>) input.get("slides"));
            decisions.set(1, Map.of("slide", index, "include", true, "reason", "test"));
            input.put("slides", decisions);
            mvc.perform(put("/api/generation/v1/presentations/{id}/content", id).with(csrf())
                            .contentType("application/json").content(json.writeValueAsString(input)))
                    .andExpect(status().isUnprocessableContent());
        }
        assertThat(service.get(USER,id).get("status")).isEqualTo("awaiting_content");
    }

    @Test void chatWritesANewVersionAndFailurePreservesThePreviousFile() throws Exception {
        UUID id = readyManual();
        byte[] original = Files.readAllBytes(service.download(USER, id));
        when(generator.generate(anyString(), anyMap(), anyList())).thenReturn(plan("Обновлённый план"));
        mvc.perform(post("/api/generation/v1/presentations/{id}/chat", id).with(csrf())
                        .contentType("application/json").content("{\"message\":\"Обнови заголовок\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.version").value(2));
        assertThat(service.versions(USER,id)).hasSize(2);
        String firstFile = db.queryForObject("SELECT output_path FROM presentation_revisions WHERE presentation_id=? AND version=1", String.class, id);
        assertThat(Files.readAllBytes(Path.of(firstFile))).isEqualTo(original);
        byte[] latest = Files.readAllBytes(service.download(USER,id));
        when(generator.generate(anyString(), anyMap(), anyList())).thenThrow(new IllegalStateException("simulated failure"));
        mvc.perform(post("/api/generation/v1/presentations/{id}/chat", id).with(csrf())
                        .contentType("application/json").content("{\"message\":\"Ещё одна правка\"}"))
                .andExpect(status().isBadGateway());
        assertThat(service.get(USER,id).get("version")).isEqualTo(2);
        assertThat(Files.readAllBytes(service.download(USER,id))).isEqualTo(latest);
        assertThat(service.versions(USER,id)).hasSize(2);
    }

    @Test void concurrentChatIsRejectedBeforeAnotherModelCall() throws Exception {
        UUID id = readyManual();
        new TransactionTemplate(transactionManager).executeWithoutResult(tx -> {
            db.queryForObject("SELECT id FROM generated_presentations WHERE id=? FOR UPDATE", UUID.class, id);
            var other = CompletableFuture.supplyAsync(() -> assertThrows(PresentationGenerationService.GenerationException.class,
                    () -> service.chat(USER,id,"Параллельная правка")));
            try { assertThat(other.get(5, TimeUnit.SECONDS).code()).isEqualTo("edit_in_progress"); }
            catch (Exception error) { throw new IllegalStateException(error); }
        });
        verify(generator, never()).generate(anyString(), anyMap(), anyList());
    }

    @Test void idempotencyKeyIncludesTheChosenModeAndUnknownModesAreRejected() throws Exception {
        String key = UUID.randomUUID().toString();
        var first = service.create(USER,"aurora","Один и тот же запрос","manual",key);
        assertThat(service.create(USER,"aurora","Один и тот же запрос","manual",key)).isEqualTo(first);
        assertThat(assertThrows(PresentationGenerationService.GenerationException.class,
                () -> service.create(USER,"aurora","Один и тот же запрос","openai",key)).status()).isEqualTo(409);
        assertThat(assertThrows(PresentationGenerationService.GenerationException.class,
                () -> service.create(USER,"aurora","Один и тот же запрос","unknown",null)).status()).isEqualTo(422);
        mvc.perform(get("/api/generation/v1/templates/unknown/context")).andExpect(status().isNotFound());
    }

    private UUID createManual() throws Exception {
        var result = mvc.perform(post("/api/generation/v1/presentations").with(csrf())
                        .contentType("application/json").content("{\"template_id\":\"aurora\",\"topic\":\"Тестовый ручной проект\",\"mode\":\"manual\"}"))
                .andExpect(status().isAccepted()).andReturn();
        return UUID.fromString(json.readTree(result.getResponse().getContentAsString()).path("id").asText());
    }

    private UUID readyManual() throws Exception {
        UUID id = createManual();
        service.submitManual(USER,id,plan("Исходный план"));
        service.processOne();
        assertThat(service.get(USER,id).get("status")).isEqualTo("succeeded");
        return id;
    }

    private Map<String,Object> plan(String title) {
        Map<String,String> fields = new LinkedHashMap<>();
        templates.fields().keySet().forEach(field -> fields.put(field,"Текст"));
        fields.put("TITLE",title);
        List<Map<String,Object>> slides = new ArrayList<>();
        for (int number=1; number<=templates.slideManifest().size(); number++) slides.add(Map.of("slide",number,"include",number==1,"reason","Test selection"));
        Map<String,Object> plan = new LinkedHashMap<>();
        plan.put("fields",fields); plan.put("slides",slides);
        return plan;
    }
}
