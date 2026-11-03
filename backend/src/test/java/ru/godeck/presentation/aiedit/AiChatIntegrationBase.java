package ru.godeck.presentation.aiedit;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import static java.nio.charset.StandardCharsets.UTF_8;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
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
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import ru.godeck.auth.security.AuthPrincipal;
import ru.godeck.common.security.SecurityPolicy;
import ru.godeck.presentation.PresentationService;
import ru.godeck.presentation.aiedit.ai.ScriptedTextEditLlm;
import ru.godeck.presentation.generation.PresentationWorker;
import ru.godeck.presentation.model.PresentationContent;
import ru.godeck.presentation.template.PresentationTemplateService;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Common ground of the AI chat tests: real Spring Security, PostgreSQL and the scripted model over
 * HTTP, in their own schema. No request reaches OpenAI.
 */
@SpringBootTest(
        properties = {
            "godeck.auth.dev-bypass=false",
            "godeck.generation.enabled=false",
            "godeck.generation.poll-ms=86400000",
            "godeck.ai-edit.llm=scripted",
            "spring.datasource.hikari.schema=ai_chat_test",
            "spring.flyway.default-schema=ai_chat_test",
            "spring.flyway.schemas=ai_chat_test"
        })
@AutoConfigureMockMvc
@ActiveProfiles("test")
abstract class AiChatIntegrationBase {
    static final String TEMPLATE = "atlas";
    static final String BLOCK = "note-1";
    static final UUID OWNER = UUID.randomUUID();
    static final UUID OTHER = UUID.randomUUID();
    static final String TEXTS = "/api/generation/v1/presentations/{id}/editor/ai/text-edits";
    static final Path OUTPUT =
            Path.of(System.getProperty("java.io.tmpdir"), "godeck-ai-chat-test-" + UUID.randomUUID());

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate db;
    @Autowired ObjectMapper json;
    @Autowired PresentationTemplateService templates;
    @Autowired PresentationService service;
    @Autowired PresentationWorker worker;
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
                () -> database.replace("currentSchema=auth_test", "currentSchema=ai_chat_test"));
        properties.add("godeck.generation.data-dir", OUTPUT::toString);
    }

    @BeforeEach
    void setUpPresentation() {
        db.update("DELETE FROM generated_presentations");
        db.update("DELETE FROM app_users");
        for (UUID user : List.of(OWNER, OTHER))
            db.update(
                    "INSERT INTO app_users (id, email, password_hash, consent_at, created_at)"
                            + " VALUES (?, ?, 'x', now(), now())",
                    user,
                    user + "@example.test");
        field = slideField(1, name -> !name.equals("TITLE"));
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

    ResultActions send(Map<String, Object> request) throws Exception {
        return send(OWNER, id, request);
    }

    ResultActions send(UUID user, UUID presentation, Map<String, Object> request) throws Exception {
        return mvc.perform(
                post(TEXTS, presentation)
                        .with(as(user))
                        .with(csrf())
                        .contentType("application/json")
                        .content(json.writeValueAsString(request)));
    }

    JsonNode read(ResultActions result) throws Exception {
        return json.readTree(result.andReturn().getResponse().getContentAsString(UTF_8));
    }

    static RequestPostProcessor as(UUID user) {
        return authentication(
                UsernamePasswordAuthenticationToken.authenticated(
                        new AuthPrincipal(user, user + "@example.test", 0),
                        null,
                        AuthorityUtils.createAuthorityList(SecurityPolicy.USER_AUTHORITY)));
    }

    static Map<String, Object> request(
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

    static Map<String, Object> custom(String instruction, Map<String, Object> target, String text) {
        return request("custom", Map.of("instruction", instruction), target, text);
    }

    Map<String, Object> fieldTarget() {
        return fieldTarget("slide-1", field);
    }

    static Map<String, Object> fieldTarget(String slide, String key) {
        Map<String, Object> target = new HashMap<>();
        target.put("kind", "template_field");
        target.put("slide_id", slide);
        target.put("field_key", key);
        target.put("block_id", null);
        return target;
    }

    static Map<String, Object> blockTarget() {
        Map<String, Object> target = new HashMap<>();
        target.put("kind", "custom_block");
        target.put("slide_id", "slide-1");
        target.put("field_key", null);
        target.put("block_id", BLOCK);
        return target;
    }

    @SuppressWarnings("unchecked")
    private String slideField(int number, java.util.function.Predicate<String> filter) {
        List<String> fields =
                (List<String>) templates.slideManifest(TEMPLATE).get(number - 1).get("fields");
        return fields.stream().filter(filter).findFirst().orElse(fields.getFirst());
    }

    /** A field of the template that slide 1 does not have. */
    @SuppressWarnings("unchecked")
    String foreignField() {
        List<String> fields = (List<String>) templates.slideManifest(TEMPLATE).getFirst().get("fields");
        return templates.fields(TEMPLATE).keySet().stream()
                .filter(name -> !fields.contains(name))
                .findFirst()
                .orElseThrow();
    }

    UUID readyPresentation(UUID user) {
        return readyPresentation(user, this::slideOneOnly);
    }

    UUID readyPresentation(UUID user, java.util.function.IntPredicate included) {
        Map<String, String> fields = new LinkedHashMap<>();
        templates.fields(TEMPLATE).keySet().forEach(key -> fields.put(key, "Другое поле"));
        fields.put("TITLE", "GoDeck для отделов продаж");
        List<PresentationContent.Slide> slides = new ArrayList<>();
        for (int number = 1; number <= templates.slideManifest(TEMPLATE).size(); number++)
            slides.add(
                    new PresentationContent.Slide(
                            number,
                            included.test(number),
                            "AI chat test",
                            false,
                            number == 1
                                    ? List.of(
                                            new PresentationContent.TextBlock(
                                                    BLOCK, "Заметка", 10, 60, 40, 20, 18, 400, "left", "ink"))
                                    : List.of(),
                            List.of(),
                            List.of()));
        UUID created =
                service.create(user, TEMPLATE, "Тема презентации", "manual", null, null, null, null, null)
                        .id();
        service.submitManual(user, created, new PresentationContent(fields, slides));
        worker.processOne();
        return created;
    }

    private boolean slideOneOnly(int number) {
        return number == 1;
    }
}
