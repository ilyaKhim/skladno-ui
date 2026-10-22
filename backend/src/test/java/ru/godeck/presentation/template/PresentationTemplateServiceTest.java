package ru.godeck.presentation.template;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.apache.poi.xslf.usermodel.XMLSlideShow;
import org.apache.poi.xslf.usermodel.XSLFShape;
import org.apache.poi.xslf.usermodel.XSLFTextShape;
import org.junit.jupiter.api.Test;

import ru.godeck.presentation.model.PresentationContent;

import java.io.ByteArrayInputStream;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

class PresentationTemplateServiceTest {
    @Test
    void inspectsAndFillsEveryPlaceholderInBundledTemplate() throws Exception {
        var service = new PresentationTemplateService();
        assertTrue(service.fields().containsKey("TITLE"));
        assertTrue(service.fields().get("TITLE") > 12, "POI anchors must be measured in points");
        assertTrue(service.fields().values().stream().anyMatch(limit -> limit > 100));
        Map<String, String> values = new LinkedHashMap<>();
        service.fields().keySet().forEach(field -> values.put(field, "Demo " + field));
        int count = (Integer) service.catalog().get("available_slides");
        List<Map<String, Object>> slides = new ArrayList<>();
        for (int number = 1; number <= count; number++) {
            slides.add(Map.of("slide", number, "include", true, "reason", "Test slide"));
        }

        byte[] rendered =
                service.render(
                        new PresentationContent(
                                values,
                                slides.stream()
                                        .map(
                                                slide ->
                                                        new PresentationContent.Slide(
                                                                (Integer) slide.get("slide"),
                                                                (Boolean) slide.get("include"),
                                                                (String) slide.get("reason")))
                                        .toList()));
        try (XMLSlideShow show = new XMLSlideShow(new ByteArrayInputStream(rendered))) {
            assertTrue(show.getSlides().size() == count);
            for (var slide : show.getSlides()) {
                for (XSLFShape shape : slide.getShapes()) {
                    if (shape instanceof XSLFTextShape text)
                        assertFalse(text.getText().contains("{{"));
                }
            }
        }
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = {"atlas", "monolith", "nord", "opal"})
    void sidecarLimitsAndDescriptionsAreUsedButSlideSelectionComesFromTheAnswer(String id)
            throws Exception {
        var service = new PresentationTemplateService();
        org.assertj.core.api.Assertions.assertThat(service.fields(id))
                .hasSize(79)
                .containsEntry("TITLE", 44)
                .containsEntry("NUM_1_VALUE", 7);
        var description = service.description(id);
        org.assertj.core.api.Assertions.assertThat(description.path("slides").asInt())
                .isEqualTo(13);
        org.assertj.core.api.Assertions.assertThat(service.withDescription(id, "Проверка 100%"))
                .contains(
                        description.path("style").asText(),
                        "field_hints",
                        "slide_rules",
                        "Проверка 100%");
        Map<String, String> values = new LinkedHashMap<>();
        service.fields(id).keySet().forEach(field -> values.put(field, ""));
        values.put("TITLE", "Я".repeat(100));
        var slides =
                java.util.stream.IntStream.rangeClosed(1, 13)
                        .mapToObj(
                                n ->
                                        new PresentationContent.Slide(
                                                n, n == 1 || n == 5, "Выбор модели"))
                        .toList();
        var plan = new PresentationContent(values, slides);
        org.assertj.core.api.Assertions.assertThat(
                        service.normalize(id, plan).fields().get("TITLE"))
                .hasSize(44);
        // The answer explicitly includes the numbers layout even though its fields are empty.
        try (var show = new XMLSlideShow(new ByteArrayInputStream(service.render(id, plan)))) {
            org.assertj.core.api.Assertions.assertThat(show.getSlides()).hasSize(2);
        }
    }

    @Test
    void templatesWithoutSidecarKeepTheirExistingBehavior() throws Exception {
        var service = new PresentationTemplateService();
        org.assertj.core.api.Assertions.assertThat(service.withDescription("aurora", "Topic"))
                .isEqualTo("Topic");
        org.assertj.core.api.Assertions.assertThat(service.catalogs()).hasSize(5);
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> service.fields("unknown"))
                .isInstanceOf(ru.godeck.presentation.exception.GenerationException.class);
    }
}
