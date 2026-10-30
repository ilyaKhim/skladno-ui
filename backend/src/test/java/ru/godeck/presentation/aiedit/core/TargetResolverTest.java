package ru.godeck.presentation.aiedit.core;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import ru.godeck.presentation.entity.Presentation;
import ru.godeck.presentation.exception.GenerationException;
import ru.godeck.presentation.mapper.PresentationContentCodec;
import ru.godeck.presentation.mapper.PresentationEditorDraftCodec;
import ru.godeck.presentation.model.PresentationContent;
import ru.godeck.presentation.model.PresentationEditorDraft;
import ru.godeck.presentation.model.PresentationStatus;
import ru.godeck.presentation.repository.PresentationRepository;
import ru.godeck.presentation.template.PresentationContentValidator;
import ru.godeck.presentation.template.PresentationTemplateService;

import tools.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/** Target verification against a document, without Spring or a database. */
class TargetResolverTest {
    static PresentationTemplateService templates;
    static final ObjectMapper JSON = new ObjectMapper();
    final PresentationRepository repository = mock(PresentationRepository.class);
    final PresentationContentCodec contentCodec = new PresentationContentCodec(JSON);
    final PresentationEditorDraftCodec editorCodec = new PresentationEditorDraftCodec(JSON);
    final TargetResolver resolver =
            new TargetResolver(repository, templates, contentCodec, editorCodec);
    static final UUID ID = UUID.randomUUID();
    static final UUID USER = UUID.randomUUID();

    @BeforeAll
    static void loadTemplates() throws Exception {
        templates = new PresentationTemplateService(JSON, new PresentationContentValidator());
    }

    @Test
    void fieldTargetGetsLimitsRoleAndBothTitles() {
        var slide = slideWithTitleAndBody("atlas");
        var content = content("atlas", Map.of(slide.title(), "Почему это важно", slide.body(), "Текст"), slide.number(), List.of());
        var resolved = resolver.resolve("atlas", ID, content, field(slide.number(), slide.body()), "Текст");
        int max = templates.fields("atlas").get(slide.body());
        assertThat(resolved.maxChars()).isEqualTo(max);
        assertThat(resolved.hardMaxChars()).isEqualTo(Math.min(4000, Math.max(2 * max, max + 100)));
        assertThat(resolved.maxInputChars()).isEqualTo(resolved.hardMaxChars());
        assertThat(resolved.role())
                .isEqualTo(
                        templates.description("atlas").path("field_hints").path(slide.body()).path("description").asText());
        assertThat(resolved.deckTitle()).isEqualTo("Заголовок презентации");
        assertThat(resolved.slideTitle()).isEqualTo("Почему это важно");
    }

    @Test
    void slideTitleIsNullWhenItIsTheTarget() {
        var slide = slideWithTitleAndBody("atlas");
        var content = content("atlas", Map.of(slide.title(), "Заголовок слайда"), slide.number(), List.of());
        var resolved = resolver.resolve("atlas", ID, content, field(slide.number(), slide.title()), "Заголовок слайда");
        assertThat(resolved.slideTitle()).isNull();
    }

    @Test
    void titlesAreShortenedAndBlankTitlesAreNull() {
        var slide = slideWithTitleAndBody("atlas");
        Map<String, String> values = new LinkedHashMap<>();
        values.put("TITLE", "Т".repeat(200));
        values.put(slide.title(), "   ");
        var resolved =
                resolver.resolve(
                        "atlas", ID, content("atlas", values, slide.number(), List.of()), field(slide.number(), slide.body()), "Текст");
        assertThat(resolved.deckTitle()).hasSize(80);
        if (!slide.title().equals("TITLE")) assertThat(resolved.slideTitle()).isNull();
    }

    @Test
    void auroraHasNoRole() {
        String field = (String) ((List<?>) templates.slideManifest("aurora").getFirst().get("fields")).getFirst();
        var resolved =
                resolver.resolve(
                        "aurora", ID, content("aurora", Map.of(), 1, List.of()), field(1, field), "Текст");
        assertThat(resolved.role()).isNull();
    }

    @Test
    void excludedOrMissingSlideAndForeignFieldAreInvalidTargets() {
        var slide = slideWithTitleAndBody("atlas");
        var content = content("atlas", Map.of(), slide.number(), List.of());
        int excluded = slide.number() == 1 ? 2 : 1;
        String excludedField = fieldsOf("atlas", excluded).getFirst();
        assertThat(code(() -> resolver.resolve("atlas", ID, content, field(excluded, excludedField), "Текст")))
                .isEqualTo("invalid_target");
        assertThat(code(() -> resolver.resolve("atlas", ID, content, field(999, "TITLE"), "Текст")))
                .isEqualTo("invalid_target");
        String foreign =
                templates.fields("atlas").keySet().stream()
                        .filter(name -> !fieldsOf("atlas", slide.number()).contains(name))
                        .findFirst()
                        .orElseThrow();
        assertThat(code(() -> resolver.resolve("atlas", ID, content, field(slide.number(), foreign), "Текст")))
                .isEqualTo("invalid_target");
        assertThat(code(() -> resolver.resolve("atlas", ID, content, field(slide.number(), "NOPE"), "Текст")))
                .isEqualTo("invalid_target");
    }

    @Test
    void customBlockUsesBlockLimitsAndMustExistOnTheSlide() {
        var slide = slideWithTitleAndBody("atlas");
        var content = content("atlas", Map.of(), slide.number(), List.of(block("note-1", "Заметка")));
        var resolved =
                resolver.resolve(
                        "atlas", ID, content, new AiEditTarget.CustomBlockTarget(slide.number(), "note-1"), "Заметка");
        assertThat(resolved.maxChars()).isEqualTo(4000);
        assertThat(resolved.hardMaxChars()).isEqualTo(4000);
        assertThat(resolved.maxInputChars()).isEqualTo(2000);
        assertThat(resolved.role()).isNull();
        assertThat(
                        code(
                                () ->
                                        resolver.resolve(
                                                "atlas", ID, content, new AiEditTarget.CustomBlockTarget(slide.number(), "other"), "Текст")))
                .isEqualTo("invalid_target");
    }

    @Test
    void inputLimitsAndTextChecks() {
        var slide = slideWithTitleAndBody("atlas");
        var content = content("atlas", Map.of(), slide.number(), List.of(block("note-1", "x")));
        var target = field(slide.number(), slide.body());
        int hard = Math.min(4000, Math.max(2 * templates.fields("atlas").get(slide.body()), templates.fields("atlas").get(slide.body()) + 100));
        assertThat(resolver.resolve("atlas", ID, content, target, "а".repeat(hard)).hardMaxChars()).isEqualTo(hard);
        assertThat(code(() -> resolver.resolve("atlas", ID, content, target, "а".repeat(hard + 1))))
                .isEqualTo("text_too_long");
        var block = new AiEditTarget.CustomBlockTarget(slide.number(), "note-1");
        assertThat(resolver.resolve("atlas", ID, content, block, "а".repeat(2000)).maxInputChars()).isEqualTo(2000);
        assertThat(code(() -> resolver.resolve("atlas", ID, content, block, "а".repeat(2001))))
                .isEqualTo("text_too_long");
        for (String invalid : List.of("", "   ", "a {{TITLE}}", "b }}"))
            assertThat(code(() -> resolver.resolve("atlas", ID, content, target, invalid)))
                    .isEqualTo("invalid_text");
    }

    @Test
    void blockIsLookedUpInTheCurrentDraftNotInPublishedContent() {
        var slide = slideWithTitleAndBody("atlas");
        var published = content("atlas", Map.of(), slide.number(), List.of(block("published-only", "x")));
        var drafted = content("atlas", Map.of(), slide.number(), List.of(block("draft-only", "x")));
        Presentation presentation = presentation(published, drafted, 1);
        when(repository.findByIdAndUserId(ID, USER)).thenReturn(Optional.of(presentation));
        assertThat(resolver.resolve(USER, ID, new AiEditTarget.CustomBlockTarget(slide.number(), "draft-only"), "x").maxChars())
                .isEqualTo(4000);
        assertThat(code(() -> resolver.resolve(USER, ID, new AiEditTarget.CustomBlockTarget(slide.number(), "published-only"), "x")))
                .isEqualTo("invalid_target");
    }

    @Test
    void outdatedDraftFallsBackToPublishedContent() {
        var slide = slideWithTitleAndBody("atlas");
        var published = content("atlas", Map.of(), slide.number(), List.of(block("published-only", "x")));
        var drafted = content("atlas", Map.of(), slide.number(), List.of(block("draft-only", "x")));
        Presentation presentation = presentation(published, drafted, 2);
        when(repository.findByIdAndUserId(ID, USER)).thenReturn(Optional.of(presentation));
        assertThat(resolver.resolve(USER, ID, new AiEditTarget.CustomBlockTarget(slide.number(), "published-only"), "x").maxChars())
                .isEqualTo(4000);
        assertThat(code(() -> resolver.resolve(USER, ID, new AiEditTarget.CustomBlockTarget(slide.number(), "draft-only"), "x")))
                .isEqualTo("invalid_target");
    }

    @Test
    void foreignAndNotReadyPresentationsAreRejected() {
        when(repository.findByIdAndUserId(ID, USER)).thenReturn(Optional.empty());
        assertThat(code(() -> resolver.resolve(USER, ID, field(1, "TITLE"), "x"))).isEqualTo("presentation_not_found");
        Presentation running = mock(Presentation.class);
        when(running.getStatus()).thenReturn(PresentationStatus.RUNNING);
        when(repository.findByIdAndUserId(ID, USER)).thenReturn(Optional.of(running));
        assertThat(code(() -> resolver.resolve(USER, ID, field(1, "TITLE"), "x"))).isEqualTo("presentation_not_ready");
    }

    /** Published version 2; the draft is current only when based on version {@code draftBase}. */
    private Presentation presentation(PresentationContent published, PresentationContent drafted, int currentVersion) {
        Presentation presentation = mock(Presentation.class);
        when(presentation.getStatus()).thenReturn(PresentationStatus.SUCCEEDED);
        when(presentation.getTemplateId()).thenReturn("atlas");
        when(presentation.getCurrentVersion()).thenReturn(currentVersion);
        when(presentation.getEditorBaseVersion()).thenReturn(1);
        when(presentation.getContentJson()).thenReturn(contentCodec.encode(published));
        when(presentation.getEditorJson())
                .thenReturn(editorCodec.encode(new PresentationEditorDraft("Черновик", Map.of(), drafted)));
        return presentation;
    }

    private record SlideFields(int number, String title, String body) {}

    /** A slide whose manifest has a title-like field first and another field after it. */
    private static SlideFields slideWithTitleAndBody(String templateId) {
        for (var slide : templates.slideManifest(templateId)) {
            @SuppressWarnings("unchecked")
            List<String> fields = (List<String>) slide.get("fields");
            String title = fields.stream().filter(f -> f.contains("TITLE")).findFirst().orElse(null);
            String body =
                    fields.stream()
                            .filter(f -> !f.contains("TITLE"))
                            .filter(f -> templates.description(templateId).path("field_hints").path(f).has("description"))
                            .findFirst()
                            .orElse(null);
            if (title != null && body != null && !title.equals("TITLE"))
                return new SlideFields((Integer) slide.get("slide"), title, body);
        }
        throw new AssertionError("No suitable slide in " + templateId);
    }

    @SuppressWarnings("unchecked")
    private static List<String> fieldsOf(String templateId, int slide) {
        return (List<String>) templates.slideManifest(templateId).get(slide - 1).get("fields");
    }

    private static PresentationContent content(
            String templateId, Map<String, String> overrides, int included, List<PresentationContent.TextBlock> blocks) {
        Map<String, String> fields = new LinkedHashMap<>();
        templates.fields(templateId).keySet().forEach(key -> fields.put(key, "Текст"));
        if (fields.containsKey("TITLE")) fields.put("TITLE", "Заголовок презентации");
        fields.putAll(overrides);
        List<PresentationContent.Slide> slides = new ArrayList<>();
        for (int number = 1; number <= templates.slideManifest(templateId).size(); number++)
            slides.add(
                    new PresentationContent.Slide(
                            number,
                            number == included,
                            "Test",
                            false,
                            number == included ? blocks : List.of(),
                            List.of(),
                            List.of()));
        return new PresentationContent(fields, slides);
    }

    private static PresentationContent.TextBlock block(String id, String text) {
        return new PresentationContent.TextBlock(id, text, 10, 10, 30, 10, 18, 400, "left", "ink");
    }

    private static AiEditTarget field(int slide, String key) {
        return new AiEditTarget.TemplateFieldTarget(slide, key);
    }

    private static String code(Runnable call) {
        try {
            call.run();
        } catch (GenerationException error) {
            return error.code();
        }
        throw new AssertionError("expected GenerationException");
    }
}
