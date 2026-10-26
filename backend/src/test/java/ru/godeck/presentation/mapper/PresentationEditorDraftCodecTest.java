package ru.godeck.presentation.mapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

import ru.godeck.presentation.model.PresentationContent;
import ru.godeck.presentation.model.PresentationEditorDraft;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

class PresentationEditorDraftCodecTest {
    private final PresentationEditorDraftCodec codec =
            new PresentationEditorDraftCodec(new ObjectMapper());

    @Test
    void roundTripPreservesSlideOrderHiddenStateAndNames() {
        Map<String, String> fields = new LinkedHashMap<>();
        fields.put("TITLE", "Новый заголовок");
        var draft =
                new PresentationEditorDraft(
                        "Редактор",
                        Map.of(7, "Выводы", 2, "Контекст"),
                        new PresentationContent(
                                fields,
                                List.of(
                                        new PresentationContent.Slide(7, true, "First", true),
                                        new PresentationContent.Slide(2, true, "Second", false))));

        assertThat(codec.decode(codec.encode(draft))).isEqualTo(draft);
    }

    @Test
    void rejectsUnknownDraftProperties() {
        assertThatThrownBy(
                        () ->
                                codec.decode(
                                        "{\"title\":\"x\",\"slideNames\":{},\"content\":{\"fields\":{},\"slides\":[]},\"extra\":true}"))
                .isInstanceOf(JacksonException.class);
    }
}
