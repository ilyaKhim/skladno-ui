package ru.godeck.presentation.mapper;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.Test;

import ru.godeck.presentation.exception.GenerationException;

import tools.jackson.databind.ObjectMapper;

class PresentationOutlineRequestCodecTest {
    private final ObjectMapper json = new ObjectMapper();
    private final PresentationOutlineRequestCodec codec = new PresentationOutlineRequestCodec(json);

    @Test
    void rejectsUnknownFieldsAndFractionalIntegersAtBothLevels() {
        for (String value :
                java.util.List.of(
                        "{\"revision\":1,\"slides\":[],\"fields\":{}}",
                        "{\"revision\":1.5,\"slides\":[]}",
                        "{\"revision\":1,\"slides\":[{\"source_slide_number\":1,\"include\":true,\"title\":null,\"hidden\":true}]}",
                        "{\"revision\":1,\"slides\":[{\"source_slide_number\":1.9,\"include\":true,\"title\":null}]}"))
            assertThatThrownBy(() -> codec.save(json.readTree(value)))
                    .isInstanceOfSatisfying(
                            GenerationException.class,
                            error -> assertThat(error.code()).isEqualTo("invalid_outline"));
        assertThatThrownBy(() -> codec.confirm(json.readTree("{\"revision\":1,\"force\":true}")))
                .isInstanceOf(GenerationException.class);
    }

    @Test
    void readsThePublicNarrowShape() {
        var value =
                codec.save(
                        json.readTree(
                                "{\"revision\":2,\"slides\":[{\"source_slide_number\":4,\"include\":true,\"title\":null}]}"));
        assertThat(value.revision()).isEqualTo(2);
        assertThat(value.slides().getFirst().sourceSlideNumber()).isEqualTo(4);
        assertThat(value.slides().getFirst().title()).isNull();
    }
}
