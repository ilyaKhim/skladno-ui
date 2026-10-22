package ru.godeck.presentation.mapper;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

class PresentationContentCodecTest {
    private final PresentationContentCodec codec = new PresentationContentCodec(new ObjectMapper());

    @Test
    void roundTripPreservesUnicodeAndSlideDecisions() {
        String json =
"""
{"fields":{"TITLE":"Привет 😀"},"slides":[{"slide":1,"include":true,"reason":"Тема"}]}\
""";
        var content = codec.decode(json);
        assertThat(codec.decode(codec.encode(content))).isEqualTo(content);
        assertThat(content.fields().get("TITLE")).isEqualTo("Привет 😀");
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "{broken",
                "{\"fields\":{},\"slides\":[],\"extra\":true}",
                "{\"fields\":{},\"slides\":[{\"slide\":1.5,\"include\":true,\"reason\":\"x\"}]}",
                "{\"fields\":{},\"slides\":[{\"slide\":1,\"include\":true,\"reason\":\"x\",\"extra\":true}]}"
            })
    void rejectsMalformedOrUnrecognizedPlans(String json) {
        assertThatThrownBy(() -> codec.decode(json)).isInstanceOf(JacksonException.class);
    }
}
