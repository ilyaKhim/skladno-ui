package ru.godeck.presentation.ai;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.ObjectMapper;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

class PresentationRequestFactoryTest {
    @Test
    void strictSchemaMatchesTheChosenFieldsAndSlideNumbers() {
        var fields = new LinkedHashMap<String, Integer>();
        fields.put("TITLE", 80);
        fields.put("BODY", 300);
        var request =
                new PresentationRequestFactory()
                        .create(
                                "Topic",
                                fields,
                                List.of(Map.of("slide", 2), Map.of("slide", 5)),
                                "custom-model");
        var json = new ObjectMapper().valueToTree(request);
        var schema = json.path("text").path("format").path("schema");
        assertThat(json.path("model").asText()).isEqualTo("custom-model");
        assertThat(schema.path("additionalProperties").asBoolean()).isFalse();
        assertThat(schema.path("properties").path("fields").path("required").toString())
                .isEqualTo("[\"TITLE\",\"BODY\"]");
        var item = schema.path("properties").path("slides").path("items");
        assertThat(item.path("additionalProperties").asBoolean()).isFalse();
        assertThat(item.path("properties").path("slide").path("enum").toString())
                .isEqualTo("[2,5]");
        assertThat(item.path("required").toString())
                .isEqualTo("[\"slide\",\"include\",\"reason\"]");
    }
}
