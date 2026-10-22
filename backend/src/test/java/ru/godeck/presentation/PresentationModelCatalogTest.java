package ru.godeck.presentation;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.ObjectMapper;

import java.util.List;
import java.util.Map;

class PresentationModelCatalogTest {
    @Test
    void configuredDefaultIsSelectableAndPreviewUsesTheChosenModelWithoutCredentials() {
        var catalog = new PresentationModelCatalog("gpt-custom-server-default");
        assertThat(catalog.resolve(null)).isEqualTo("gpt-custom-server-default");
        var generator =
                new PresentationContentGenerator(
                        new PresentationContentCodec(new ObjectMapper()), "", false);
        assertThat(generator.enabled()).isFalse();
        for (String model :
                List.of(
                        "gpt-6.1-sol",
                        "gpt-6-luna",
                        "gpt-6-astra",
                        "gpt-5.6-sol",
                        "gpt-5.6-terra",
                        "gpt-5.6-luna",
                        "gpt-5.4",
                        "gpt-5.4-mini",
                        "gpt-custom-server-default")) {
            var preview =
                    generator.preview(
                            "Тема",
                            Map.of("TITLE", 80),
                            List.of(Map.of("slide", 1, "fields", List.of("TITLE"))),
                            catalog.resolve(model));
            assertThat(preview.get("model")).isEqualTo(model);
            assertThat(preview).doesNotContainKeys("api_key", "Authorization");
        }
    }
}
