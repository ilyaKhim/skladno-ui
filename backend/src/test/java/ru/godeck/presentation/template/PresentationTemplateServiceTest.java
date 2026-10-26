package ru.godeck.presentation.template;

import static org.assertj.core.api.Assertions.*;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.apache.poi.xslf.usermodel.XMLSlideShow;
import org.apache.poi.xslf.usermodel.XSLFShape;
import org.apache.poi.xslf.usermodel.XSLFPictureShape;
import org.apache.poi.xslf.usermodel.XSLFTextShape;
import org.junit.jupiter.api.Test;

import ru.godeck.presentation.model.PresentationContent;

import java.io.ByteArrayInputStream;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

class PresentationTemplateServiceTest {
    @Test
    void cachedManifestIsDeeplyImmutableAndCannotBeChangedByARequest() throws Exception {
        var service =
                new PresentationTemplateService(
                        new tools.jackson.databind.ObjectMapper(),
                        new PresentationContentValidator());
        var manifest = service.slideManifest("atlas");
        assertThatThrownBy(() -> manifest.clear())
                .isInstanceOf(UnsupportedOperationException.class);
        assertThatThrownBy(() -> manifest.getFirst().put("slide", 99))
                .isInstanceOf(UnsupportedOperationException.class);
        assertThatThrownBy(() -> ((java.util.List<?>) manifest.getFirst().get("fields")).clear())
                .isInstanceOf(UnsupportedOperationException.class);
        assertThat(service.slideManifest("atlas").getFirst().get("slide")).isEqualTo(1);
    }

    @Test
    void inspectsAndFillsEveryPlaceholderInBundledTemplate() throws Exception {
        var service =
                new PresentationTemplateService(
                        new tools.jackson.databind.ObjectMapper(),
                        new PresentationContentValidator());
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
        var service =
                new PresentationTemplateService(
                        new tools.jackson.databind.ObjectMapper(),
                        new PresentationContentValidator());
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
        var service =
                new PresentationTemplateService(
                        new tools.jackson.databind.ObjectMapper(),
                        new PresentationContentValidator());
        org.assertj.core.api.Assertions.assertThat(service.withDescription("aurora", "Topic"))
                .isEqualTo("Topic");
        org.assertj.core.api.Assertions.assertThat(service.catalogs()).hasSize(5);
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> service.fields("unknown"))
                .isInstanceOf(ru.godeck.presentation.exception.GenerationException.class);
    }

    @Test
    void renderPreservesEditorOrderAndPowerPointHiddenState() throws Exception {
        var service =
                new PresentationTemplateService(
                        new tools.jackson.databind.ObjectMapper(),
                        new PresentationContentValidator());
        Map<String, String> values = new LinkedHashMap<>();
        service.fields("atlas").keySet().forEach(field -> values.put(field, "Demo " + field));
        List<PresentationContent.Slide> slides = new ArrayList<>();
        slides.add(new PresentationContent.Slide(13, true, "Closing first", true));
        slides.add(new PresentationContent.Slide(1, true, "Cover second", false));
        for (int number = 2; number <= 12; number++)
            slides.add(new PresentationContent.Slide(number, false, "Not selected", false));

        try (var show =
                new XMLSlideShow(
                        new ByteArrayInputStream(
                                service.render(
                                        "atlas", new PresentationContent(values, slides))))) {
            assertThat(show.getSlides()).hasSize(2);
            assertThat(show.getSlides().getFirst().isHidden()).isTrue();
            assertThat(show.getSlides().getLast().isHidden()).isFalse();
            String firstText =
                    show.getSlides().getFirst().getShapes().stream()
                            .filter(XSLFTextShape.class::isInstance)
                            .map(XSLFTextShape.class::cast)
                            .map(XSLFTextShape::getText)
                            .collect(java.util.stream.Collectors.joining("\n"));
            assertThat(firstText).contains("Demo CLOSING_TITLE");
        }
    }

    @Test
    void editorDeckUsesStableTemplateFieldIdsAndRealShapeGeometry() throws Exception {
        var service =
                new PresentationTemplateService(
                        new tools.jackson.databind.ObjectMapper(),
                        new PresentationContentValidator());
        Map<String, String> values = new LinkedHashMap<>();
        service.fields("atlas").keySet().forEach(field -> values.put(field, "Demo " + field));
        var slides =
                java.util.stream.IntStream.rangeClosed(1, 13)
                        .mapToObj(
                                number ->
                                        new PresentationContent.Slide(
                                                number, number == 1, "Cover", false))
                        .toList();
        var deck =
                service.editorDeck(
                        "atlas",
                        java.util.UUID.randomUUID(),
                        "Test deck",
                        1,
                        0,
                        Map.of(1, "Cover"),
                        new PresentationContent(values, slides));

        assertThat(deck.slides()).hasSize(1);
        assertThat(deck.slides().getFirst().blocks())
                .isNotEmpty()
                .allSatisfy(
                        block -> {
                            assertThat(block.id()).startsWith("slide-1-field-");
                            assertThat(block.width()).isPositive();
                            assertThat(block.height()).isPositive();
                        });
    }

    @Test
    void freeformTextBlocksRoundTripThroughEditorAndPowerPoint() throws Exception {
        var service =
                new PresentationTemplateService(
                        new tools.jackson.databind.ObjectMapper(),
                        new PresentationContentValidator());
        Map<String, String> values = new LinkedHashMap<>();
        service.fields("atlas").keySet().forEach(field -> values.put(field, "Demo " + field));
        var custom =
                new PresentationContent.TextBlock(
                        "text-roundtrip",
                        "Свободный текст",
                        12,
                        18,
                        36,
                        14,
                        24,
                        700,
                        "center",
                        "brand");
        var slides =
                java.util.stream.IntStream.rangeClosed(1, 13)
                        .mapToObj(
                                number ->
                                        new PresentationContent.Slide(
                                                number,
                                                number == 1,
                                                "Cover",
                                                false,
                                                number == 1 ? List.of(custom) : List.of()))
                        .toList();
        var content = new PresentationContent(values, slides);

        var deck =
                service.editorDeck(
                        "atlas",
                        java.util.UUID.randomUUID(),
                        "Test deck",
                        1,
                        0,
                        Map.of(1, "Cover"),
                        content);
        assertThat(deck.slides().getFirst().blocks())
                .filteredOn(block -> block.id().equals("text-roundtrip"))
                .singleElement()
                .satisfies(
                        block -> {
                            assertThat(block.fieldKey()).isNull();
                            assertThat(block.text()).isEqualTo("Свободный текст");
                            assertThat(block.height()).isEqualTo(14);
                        });

        try (var show =
                new XMLSlideShow(
                        new ByteArrayInputStream(service.render("atlas", content)))) {
            var rendered =
                    show.getSlides().getFirst().getShapes().stream()
                            .filter(XSLFTextShape.class::isInstance)
                            .map(XSLFTextShape.class::cast)
                            .filter(shape -> shape.getText().equals("Свободный текст"))
                            .findFirst()
                            .orElseThrow();
            assertThat(rendered.getAnchor().getX())
                    .isCloseTo(show.getPageSize().getWidth() * 0.12, within(0.1));
            assertThat(rendered.getTextParagraphs().getFirst().getTextAlign())
                    .isEqualTo(org.apache.poi.sl.usermodel.TextParagraph.TextAlign.CENTER);
        }
    }

    @Test
    void templateTextLayoutsRoundTripThroughEditorAndPowerPoint() throws Exception {
        var service =
                new PresentationTemplateService(
                        new tools.jackson.databind.ObjectMapper(),
                        new PresentationContentValidator());
        Map<String, String> values = new LinkedHashMap<>();
        service.fields("atlas").keySet().forEach(field -> values.put(field, "Demo " + field));
        String layoutId = service.textLayoutIds("atlas", 1).getFirst();
        var layout = new PresentationContent.TextLayout(layoutId, 20, 25, 50, 30);
        var slides =
                java.util.stream.IntStream.rangeClosed(1, 13)
                        .mapToObj(
                                number ->
                                        new PresentationContent.Slide(
                                                number,
                                                number == 1,
                                                "Cover",
                                                false,
                                                List.of(),
                                                List.of(),
                                                number == 1 ? List.of(layout) : List.of()))
                        .toList();
        var content = new PresentationContent(values, slides);

        var deck =
                service.editorDeck(
                        "atlas",
                        UUID.randomUUID(),
                        "Test deck",
                        1,
                        0,
                        Map.of(1, "Cover"),
                        content);
        var firstBlock =
                deck.slides().getFirst().blocks().stream()
                        .filter(block -> layoutId.equals(block.layoutId()))
                        .findFirst()
                        .orElseThrow();
        assertThat(firstBlock.x()).isEqualTo(20);
        assertThat(firstBlock.y()).isEqualTo(25);

        try (var show =
                new XMLSlideShow(
                        new ByteArrayInputStream(service.render("atlas", content)))) {
            var rendered =
                    show.getSlides().getFirst().getShapes().stream()
                            .filter(XSLFTextShape.class::isInstance)
                            .map(XSLFTextShape.class::cast)
                            .filter(shape -> shape.getText().contains(firstBlock.text()))
                            .findFirst()
                            .orElseThrow();
            assertThat(rendered.getAnchor().getX())
                    .isCloseTo(show.getPageSize().getWidth() * 0.20, within(0.1));
            assertThat(rendered.getAnchor().getY())
                    .isCloseTo(show.getPageSize().getHeight() * 0.25, within(0.1));
        }
    }

    @Test
    void imageBlocksRoundTripThroughEditorAndPowerPoint() throws Exception {
        var service =
                new PresentationTemplateService(
                        new tools.jackson.databind.ObjectMapper(),
                        new PresentationContentValidator());
        Map<String, String> values = new LinkedHashMap<>();
        service.fields("atlas").keySet().forEach(field -> values.put(field, "Demo " + field));
        String assetId = UUID.randomUUID().toString();
        var image =
                new PresentationContent.ImageBlock(
                        "image-roundtrip", assetId, "Синяя точка", 10, 20, 30, 25);
        var slides =
                java.util.stream.IntStream.rangeClosed(1, 13)
                        .mapToObj(
                                number ->
                                        new PresentationContent.Slide(
                                                number,
                                                number == 1,
                                                "Cover",
                                                false,
                                                List.of(),
                                                number == 1 ? List.of(image) : List.of()))
                        .toList();
        var content = new PresentationContent(values, slides);
        UUID presentationId = UUID.randomUUID();

        var deck =
                service.editorDeck(
                        "atlas", presentationId, "Test deck", 1, 0, Map.of(1, "Cover"), content);
        assertThat(deck.slides().getFirst().images())
                .singleElement()
                .satisfies(
                        block -> {
                            assertThat(block.assetId()).isEqualTo(assetId);
                            assertThat(block.url())
                                    .isEqualTo(
                                            "/api/generation/v1/presentations/"
                                                    + presentationId
                                                    + "/editor/assets/"
                                                    + assetId);
                        });

        byte[] pixel = png();
        try (var show =
                new XMLSlideShow(
                        new ByteArrayInputStream(
                                service.render("atlas", content, ignored -> pixel)))) {
            var rendered =
                    show.getSlides().getFirst().getShapes().stream()
                            .filter(XSLFPictureShape.class::isInstance)
                            .map(XSLFPictureShape.class::cast)
                            .reduce((first, second) -> second)
                            .orElseThrow();
            assertThat(rendered.getAnchor().getX())
                    .isCloseTo(show.getPageSize().getWidth() * 0.10, within(0.1));
            assertThat(rendered.getAnchor().getWidth())
                    .isCloseTo(show.getPageSize().getWidth() * 0.30, within(0.1));
        }
    }

    private static byte[] png() throws Exception {
        var image = new java.awt.image.BufferedImage(2, 2, java.awt.image.BufferedImage.TYPE_INT_RGB);
        image.setRGB(0, 0, 0x335cc5);
        var output = new java.io.ByteArrayOutputStream();
        javax.imageio.ImageIO.write(image, "png", output);
        return output.toByteArray();
    }
}
