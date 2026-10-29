package ru.godeck.presentation.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import static java.nio.charset.StandardCharsets.UTF_8;

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
import ru.godeck.presentation.mapper.PresentationContentCodec;
import ru.godeck.presentation.model.PresentationContent;
import ru.godeck.presentation.model.PresentationStatus;
import ru.godeck.presentation.template.EditorTextLimits;
import ru.godeck.presentation.template.PresentationTemplateService;
import ru.godeck.presentation.worker.PresentationWorker;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.io.ByteArrayInputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Editor paths keep template field text longer than {@code max_chars} up to the hard limit, while
 * generation and manual assembly still truncate it.
 */
@SpringBootTest(
        properties = {
            "godeck.auth.dev-bypass=true",
            "godeck.generation.poll-ms=86400000",
            "spring.datasource.hikari.schema=editor_text_test",
            "spring.flyway.default-schema=editor_text_test",
            "spring.flyway.schemas=editor_text_test"
        })
@AutoConfigureMockMvc
class EditorLongTextIntegrationTest {
    static final UUID USER = UUID.nameUUIDFromBytes("godeck-local-debug-user".getBytes(UTF_8));
    static final String TEMPLATE = "atlas";
    static final Path OUTPUT =
            Path.of(
                    System.getProperty("java.io.tmpdir"),
                    "godeck-editor-text-test-" + UUID.randomUUID());
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate db;
    @Autowired ObjectMapper json;
    @Autowired PresentationTemplateService templates;
    @Autowired PresentationService service;
    @Autowired PresentationWorker worker;
    @Autowired PresentationContentCodec codec;
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
                () -> database.replace("currentSchema=auth_test", "currentSchema=editor_text_test"));
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
    void draftLoadAndExportKeepFieldTextUpToTheHardLimit() throws Exception {
        String field = coverField();
        int max = templates.fields(TEMPLATE).get(field);
        int hard = EditorTextLimits.hard(max);
        UUID id = readyPresentation(Map.of());
        JsonNode editor = editor(id);
        JsonNode block = fieldBlock(editor, field);
        assertThat(block.path("max_chars").asInt()).isEqualTo(max);
        assertThat(block.path("hard_max_chars").asInt()).isEqualTo(hard);

        String longText = text(max + 10);
        mvc.perform(
                        put("/api/generation/v1/presentations/{id}/editor/draft", id)
                                .with(csrf())
                                .contentType("application/json")
                                .content(draft(editor, field, longText, 1, 0)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.draft_revision").value(1));

        mvc.perform(
                        put("/api/generation/v1/presentations/{id}/editor/draft", id)
                                .with(csrf())
                                .contentType("application/json")
                                .content(draft(editor, field, text(hard + 1), 1, 1)))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.error.code").value("invalid_content"));
        mvc.perform(
                        put("/api/generation/v1/presentations/{id}/editor/draft", id)
                                .with(csrf())
                                .contentType("application/json")
                                .content(draft(editor, field, text(hard), 1, 1)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.draft_revision").value(2));
        mvc.perform(
                        put("/api/generation/v1/presentations/{id}/editor/draft", id)
                                .with(csrf())
                                .contentType("application/json")
                                .content(draft(editor, field, longText, 1, 2)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.draft_revision").value(3));

        JsonNode reloaded = editor(id);
        assertThat(fieldBlock(reloaded, field).path("text").asText()).isEqualTo(longText);
        assertThat(fieldBlock(reloaded, field).path("hard_max_chars").asInt()).isEqualTo(hard);

        mvc.perform(
                        post("/api/generation/v1/presentations/{id}/editor/commit", id)
                                .with(csrf())
                                .contentType("application/json")
                                .content("{\"base_version\":1,\"draft_revision\":3}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.version").value(2));
        assertThat(publishedField(id, field)).isEqualTo(longText);
        assertThat(pptxText(id)).contains(longText);
        assertThat(fieldBlock(editor(id), field).path("text").asText()).isEqualTo(longText);
    }

    @Test
    void customTextBlocksAdvertiseTheAbsoluteLimit() throws Exception {
        UUID id = readyPresentation(Map.of());
        JsonNode editor = editor(id);
        var withBlock = json.readTree(draftWithCustomBlock(editor, "x".repeat(4_000)));
        mvc.perform(
                        put("/api/generation/v1/presentations/{id}/editor/draft", id)
                                .with(csrf())
                                .contentType("application/json")
                                .content(json.writeValueAsString(withBlock)))
                .andExpect(status().isOk());
        JsonNode custom = null;
        for (JsonNode slide : editor(id).path("slides"))
            for (JsonNode block : slide.path("blocks"))
                if ("ai-long-block".equals(block.path("id").asText())) custom = block;
        assertThat(custom).isNotNull();
        assertThat(custom.path("max_chars").asInt()).isEqualTo(4_000);
        assertThat(custom.path("hard_max_chars").asInt()).isEqualTo(4_000);
        mvc.perform(
                        put("/api/generation/v1/presentations/{id}/editor/draft", id)
                                .with(csrf())
                                .contentType("application/json")
                                .content(draftWithCustomBlock(editor(id), "x".repeat(4_001))))
                .andExpect(status().isUnprocessableContent());
    }

    @Test
    void generationStillTruncatesFieldsToMaxChars() throws Exception {
        String field = coverField();
        int max = templates.fields(TEMPLATE).get(field);
        String longText = text(max + 50);
        when(generator.generate(any(), anyString(), anyMap(), anyList(), anyString()))
                .thenReturn(plan(Map.of(field, longText)));
        UUID id = service.create(USER, TEMPLATE, "Длинный ответ модели", "openai", null, null).id();
        worker.processOne();
        assertThat(service.get(USER, id).status()).isEqualTo(PresentationStatus.SUCCEEDED);
        String stored = publishedField(id, field);
        assertThat(stored.length()).isLessThanOrEqualTo(max);
        assertThat(stored).endsWith("…");
        assertThat(pptxText(id)).doesNotContain(longText).contains(stored);
    }

    @Test
    void manualAssemblyStillTruncatesFieldsToMaxChars() throws Exception {
        String field = coverField();
        int max = templates.fields(TEMPLATE).get(field);
        String longText = text(max + 50);
        UUID id = readyPresentation(Map.of(field, longText));
        String stored = publishedField(id, field);
        assertThat(stored.length()).isLessThanOrEqualTo(max);
        assertThat(pptxText(id)).doesNotContain(longText);
        verify(generator, never()).generate(any(), anyString(), anyMap(), anyList(), anyString());
    }

    /** Words separated by spaces, so truncation can find a word boundary like real text. */
    static String text(int length) {
        var text = new StringBuilder();
        while (text.length() < length) text.append("слово ");
        String value = text.substring(0, length);
        return value.endsWith(" ") ? value.substring(0, length - 1) + "ё" : value;
    }

    @SuppressWarnings("unchecked")
    private String coverField() {
        List<String> fields = (List<String>) templates.slideManifest(TEMPLATE).getFirst().get("fields");
        return fields.contains("TITLE") ? "TITLE" : fields.getFirst();
    }

    private UUID readyPresentation(Map<String, String> overrides) {
        UUID id = service.create(USER, TEMPLATE, "Длинный текст", "manual", null, null).id();
        service.submitManual(USER, id, plan(overrides));
        worker.processOne();
        assertThat(service.get(USER, id).status()).isEqualTo(PresentationStatus.SUCCEEDED);
        return id;
    }

    private PresentationContent plan(Map<String, String> overrides) {
        Map<String, String> fields = new LinkedHashMap<>();
        templates.fields(TEMPLATE).keySet().forEach(key -> fields.put(key, "Текст"));
        fields.putAll(overrides);
        List<PresentationContent.Slide> slides = new ArrayList<>();
        for (int number = 1; number <= templates.slideManifest(TEMPLATE).size(); number++)
            slides.add(new PresentationContent.Slide(number, number == 1, "Long text test"));
        return new PresentationContent(fields, slides);
    }

    private JsonNode editor(UUID id) throws Exception {
        return json.readTree(
                mvc.perform(get("/api/generation/v1/presentations/{id}/editor", id))
                        .andExpect(status().isOk())
                        .andReturn()
                        .getResponse()
                        .getContentAsString(UTF_8));
    }

    private static JsonNode fieldBlock(JsonNode editor, String field) {
        for (JsonNode slide : editor.path("slides"))
            for (JsonNode block : slide.path("blocks"))
                if (field.equals(block.path("field_key").asText())) return block;
        throw new AssertionError("No editor block for " + field);
    }

    private String draft(JsonNode editor, String field, String value, int base, long revision) {
        return json.writeValueAsString(snapshot(editor, field, value, base, revision, null));
    }

    private String draftWithCustomBlock(JsonNode editor, String text) {
        return json.writeValueAsString(
                snapshot(
                        editor,
                        null,
                        null,
                        editor.path("base_version").asInt(),
                        editor.path("draft_revision").asLong(),
                        text));
    }

    /** Converts the editor projection back into the autosave request it was produced from. */
    private Map<String, Object> snapshot(
            JsonNode editor,
            String field,
            String value,
            int base,
            long revision,
            String customText) {
        List<Map<String, Object>> slides = new ArrayList<>();
        for (JsonNode slide : editor.path("slides")) {
            List<Map<String, Object>> blocks = new ArrayList<>();
            var seen = new java.util.HashSet<String>();
            for (JsonNode block : slide.path("blocks")) {
                if (block.path("field_key").isNull()) continue;
                String key = block.path("field_key").asText();
                if (!seen.add(key)) continue;
                blocks.add(
                        Map.of(
                                "field_key",
                                key,
                                "text",
                                key.equals(field) ? value : block.path("text").asText()));
            }
            List<Map<String, Object>> custom = new ArrayList<>();
            if (customText != null && slides.isEmpty())
                custom.add(
                        Map.of(
                                "id", "ai-long-block",
                                "text", customText,
                                "x", 10,
                                "y", 10,
                                "width", 40,
                                "height", 20,
                                "font_size", 18,
                                "weight", 400,
                                "align", "left",
                                "color", "ink"));
            slides.add(
                    Map.of(
                            "source_slide_number",
                            slide.path("source_slide_number").asInt(),
                            "name",
                            slide.path("name").asText(),
                            "hidden",
                            slide.path("hidden").asBoolean(),
                            "blocks",
                            blocks,
                            "custom_blocks",
                            custom));
        }
        return Map.of(
                "base_version",
                base,
                "draft_revision",
                revision,
                "title",
                editor.path("title").asText(),
                "slides",
                slides);
    }

    private String publishedField(UUID id, String field) {
        String content =
                db.queryForObject(
                        "SELECT content_json FROM generated_presentations WHERE id=?",
                        String.class,
                        id);
        return codec.decode(content).fields().get(field);
    }

    private String pptxText(UUID id) throws Exception {
        try (var show =
                new XMLSlideShow(
                        new ByteArrayInputStream(Files.readAllBytes(service.download(USER, id))))) {
            return show.getSlides().stream()
                    .flatMap(slide -> slide.getShapes().stream())
                    .filter(XSLFTextShape.class::isInstance)
                    .map(XSLFTextShape.class::cast)
                    .map(XSLFTextShape::getText)
                    .collect(Collectors.joining("\n"));
        }
    }
}
