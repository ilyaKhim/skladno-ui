package ru.godeck.presentation.service;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import ru.godeck.presentation.dto.ConfirmPresentationOutlineRequest;
import ru.godeck.presentation.dto.SavePresentationOutlineRequest;
import ru.godeck.presentation.entity.Presentation;
import ru.godeck.presentation.exception.GenerationException;
import ru.godeck.presentation.mapper.PresentationContentCodec;
import ru.godeck.presentation.model.PresentationContent;
import ru.godeck.presentation.model.PresentationStatus;
import ru.godeck.presentation.repository.PresentationRepository;
import ru.godeck.presentation.template.PresentationContentValidator;
import ru.godeck.presentation.template.PresentationTemplateService;

import tools.jackson.databind.ObjectMapper;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

class PresentationOutlineServiceTest {
    private final UUID owner = UUID.randomUUID();
    private final UUID id = UUID.randomUUID();
    private final PresentationRepository repository = mock(PresentationRepository.class);
    private final PresentationTemplateService templates = mock(PresentationTemplateService.class);
    private final ObjectMapper json = new ObjectMapper();
    private final PresentationContentCodec codec = new PresentationContentCodec(json);
    private final PresentationOutlineService service =
            new PresentationOutlineService(
                    repository,
                    templates,
                    codec,
                    Clock.fixed(Instant.parse("2026-10-29T00:00:00Z"), ZoneOffset.UTC));
    private final Map<String, Integer> fields =
            Map.of("TITLE", 80, "BODY", 200, "SECOND_TITLE", 40, "FOOTER", 20);
    private Presentation presentation;

    @BeforeEach
    void setup() {
        presentation = org.springframework.beans.BeanUtils.instantiateClass(Presentation.class);
        ReflectionTestUtils.setField(presentation, "id", id);
        ReflectionTestUtils.setField(presentation, "userId", owner);
        ReflectionTestUtils.setField(presentation, "templateId", "test");
        ReflectionTestUtils.setField(presentation, "status", PresentationStatus.AWAITING_REVIEW);
        ReflectionTestUtils.setField(presentation, "reviewBeforeRender", true);
        ReflectionTestUtils.setField(presentation, "outlineRevision", 1L);
        ReflectionTestUtils.setField(presentation, "createdAt", Instant.EPOCH);
        ReflectionTestUtils.setField(presentation, "updatedAt", Instant.EPOCH);
        when(repository.findByIdAndUserId(id, owner)).thenReturn(Optional.of(presentation));
        when(repository.findOutlineForUpdate(id, owner)).thenReturn(Optional.of(presentation));
        when(templates.fields("test")).thenReturn(fields);
        when(templates.description("test"))
                .thenReturn(json.readTree("{\"slide_rules\":{\"1\":{\"purpose\":\"Обложка\"}}}"));
        when(templates.slideManifest("test"))
                .thenReturn(
                        List.of(
                                Map.of("slide", 1, "fields", List.of("TITLE", "BODY", "FOOTER")),
                                Map.of("slide", 2, "fields", List.of("SECOND_TITLE", "FOOTER"))));
        when(templates.normalize(eq("test"), any()))
                .thenAnswer(
                        invocation ->
                                new PresentationContentValidator()
                                        .normalize(invocation.getArgument(1), fields, 2));
        setContent(
                new PresentationContent(
                        Map.of(
                                "TITLE",
                                "Первый",
                                "BODY",
                                "Факты",
                                "SECOND_TITLE",
                                "Второй",
                                "FOOTER",
                                "Секретный footer"),
                        List.of(
                                new PresentationContent.Slide(
                                        1,
                                        true,
                                        "one",
                                        true,
                                        List.of(
                                                new PresentationContent.TextBlock(
                                                        "custom",
                                                        "Не терять",
                                                        1,
                                                        2,
                                                        20,
                                                        10,
                                                        16,
                                                        400,
                                                        "left",
                                                        "ink")),
                                        List.of(),
                                        List.of(
                                                new PresentationContent.TextLayout(
                                                        "shape", 1, 2, 20, 10))),
                                new PresentationContent.Slide(2, true, "two"))));
    }

    @Test
    void reviewProjectionUsesActualValuesPurposeAndUniquePrimaryWithoutFooter() {
        var view = service.get(owner, id);
        assertThat(view.revision()).isEqualTo(1);
        assertThat(view.slides().getFirst().titleFieldKey()).isEqualTo("TITLE");
        assertThat(view.slides().getFirst().titleMaxChars()).isEqualTo(80);
        assertThat(view.slides().getFirst().description()).isEqualTo("Обложка");
        assertThat(view.slides().getFirst().summary()).isEqualTo("Факты");
        assertThat(json.writeValueAsString(view)).doesNotContain("Секретный footer");
    }

    @Test
    void saveChangesOnlyOrderInclusionAndPrimaryTitles() {
        var before = codec.decode(presentation.getContentJson());
        var saved =
                service.save(
                        owner,
                        id,
                        new SavePresentationOutlineRequest(
                                1,
                                List.of(
                                        new SavePresentationOutlineRequest.Slide(
                                                2, false, "Изменённый"),
                                        new SavePresentationOutlineRequest.Slide(
                                                1, true, "Новая обложка"))));
        assertThat(saved.revision()).isEqualTo(2);
        var after = codec.decode(presentation.getContentJson());
        assertThat(after.slides())
                .extracting(PresentationContent.Slide::slide)
                .containsExactly(2, 1);
        assertThat(after.slides().getLast()).isEqualTo(before.slides().getFirst());
        assertThat(after.fields())
                .containsEntry("BODY", "Факты")
                .containsEntry("FOOTER", "Секретный footer")
                .containsEntry("TITLE", "Новая обложка");
        assertThat(service.get(owner, id)).isEqualTo(saved);
        assertThat(
                        service.save(
                                        owner,
                                        id,
                                        new SavePresentationOutlineRequest(
                                                2,
                                                List.of(
                                                        new SavePresentationOutlineRequest.Slide(
                                                                2, false, "Изменённый"),
                                                        new SavePresentationOutlineRequest.Slide(
                                                                1, true, "Новая обложка"))))
                                .revision())
                .isEqualTo(2);
    }

    @Test
    void rejectsStalePermutationAllExcludedAndOverlongTitlesWithoutChangingSnapshot() {
        String before = presentation.getContentJson();
        assertCode(() -> service.save(owner, id, request(9, true, "Первый")), "outline_conflict");
        assertCode(() -> service.save(owner, id, request(1, false, "Первый")), "invalid_outline");
        assertCode(
                () -> service.save(owner, id, request(1, true, "x".repeat(81))), "invalid_outline");
        assertCode(() -> service.save(owner, id, request(1, true, " ")), "invalid_outline");
        assertCode(
                () ->
                        service.save(
                                owner,
                                id,
                                new SavePresentationOutlineRequest(
                                        1,
                                        List.of(
                                                new SavePresentationOutlineRequest.Slide(
                                                        1, true, "Первый"),
                                                new SavePresentationOutlineRequest.Slide(
                                                        1, true, "Первый")))),
                "invalid_outline");
        assertCode(
                () ->
                        service.save(
                                owner,
                                id,
                                new SavePresentationOutlineRequest(
                                        1,
                                        List.of(
                                                new SavePresentationOutlineRequest.Slide(
                                                        1, true, "Первый")))),
                "invalid_outline");
        assertCode(
                () ->
                        service.save(
                                owner,
                                id,
                                new SavePresentationOutlineRequest(
                                        1,
                                        List.of(
                                                new SavePresentationOutlineRequest.Slide(
                                                        1, true, "Первый"),
                                                new SavePresentationOutlineRequest.Slide(
                                                        99, true, "Второй")))),
                "invalid_outline");
        assertThat(presentation.getContentJson()).isEqualTo(before);
        assertThat(presentation.getOutlineRevision()).isEqualTo(1);
    }

    @Test
    void sharedAmbiguousAndEmptyPrimaryTitlesAreReadOnly() {
        when(templates.slideManifest("test"))
                .thenReturn(
                        List.of(
                                Map.of("slide", 1, "fields", List.of("TITLE", "BODY", "FOOTER")),
                                Map.of("slide", 2, "fields", List.of("TITLE", "FOOTER"))));
        var view = service.get(owner, id);
        assertThat(view.slides()).allSatisfy(slide -> assertThat(slide.titleFieldKey()).isNull());
        assertCode(
                () -> service.save(owner, id, request(1, true, "Injected shared title")),
                "invalid_outline");
        when(templates.slideManifest("test"))
                .thenReturn(
                        List.of(
                                Map.of(
                                        "slide",
                                        1,
                                        "fields",
                                        List.of("TITLE", "SECOND_TITLE", "BODY")),
                                Map.of("slide", 2, "fields", List.of("FOOTER"))));
        assertThat(service.get(owner, id).slides().getFirst().titleFieldKey()).isNull();
        var content = codec.decode(presentation.getContentJson());
        var edited = new java.util.HashMap<>(content.fields());
        edited.put("TITLE", "");
        setContent(new PresentationContent(edited, content.slides()));
        when(templates.slideManifest("test"))
                .thenReturn(
                        List.of(
                                Map.of("slide", 1, "fields", List.of("TITLE", "BODY")),
                                Map.of("slide", 2, "fields", List.of("SECOND_TITLE"))));
        assertThat(service.get(owner, id).slides().getFirst().titleFieldKey()).isNull();
        assertThat(
                        service.save(
                                        owner,
                                        id,
                                        new SavePresentationOutlineRequest(
                                                1,
                                                List.of(
                                                        new SavePresentationOutlineRequest.Slide(
                                                                1, true, null),
                                                        new SavePresentationOutlineRequest.Slide(
                                                                2, true, "Второй"))))
                                .revision())
                .isEqualTo(1);
    }

    @Test
    void confirmIsIdempotentAtSavedRevisionAndClosesFurtherEdits() {
        var confirmed = service.confirm(owner, id, new ConfirmPresentationOutlineRequest(1));
        assertThat(confirmed.status()).isEqualTo(PresentationStatus.QUEUED);
        assertThat(presentation.getOutlineConfirmedRevision()).isEqualTo(1);
        assertThat(service.confirm(owner, id, new ConfirmPresentationOutlineRequest(1)))
                .isEqualTo(confirmed);
        assertCode(
                () -> service.confirm(owner, id, new ConfirmPresentationOutlineRequest(2)),
                "outline_conflict");
        assertCode(() -> service.get(owner, id), "outline_closed");
        ReflectionTestUtils.setField(presentation, "status", PresentationStatus.CANCELLED);
        assertCode(
                () -> service.confirm(owner, id, new ConfirmPresentationOutlineRequest(1)),
                "outline_closed");
    }

    private SavePresentationOutlineRequest request(long revision, boolean included, String title) {
        return new SavePresentationOutlineRequest(
                revision,
                List.of(
                        new SavePresentationOutlineRequest.Slide(1, included, title),
                        new SavePresentationOutlineRequest.Slide(2, included, "Второй")));
    }

    private void setContent(PresentationContent content) {
        ReflectionTestUtils.setField(presentation, "contentJson", codec.encode(content));
    }

    private static void assertCode(
            org.assertj.core.api.ThrowableAssert.ThrowingCallable operation, String code) {
        assertThatThrownBy(operation)
                .isInstanceOfSatisfying(
                        GenerationException.class,
                        error -> assertThat(error.code()).isEqualTo(code));
    }
}
