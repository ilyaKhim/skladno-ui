package ru.godeck.presentation.template;

import org.apache.poi.xslf.usermodel.XMLSlideShow;
import org.apache.poi.xslf.usermodel.XSLFTextShape;
import org.junit.jupiter.api.Test;
import ru.godeck.presentation.exception.GenerationException;
import ru.godeck.presentation.model.PresentationContent;
import ru.godeck.presentation.model.TextStyle;
import tools.jackson.databind.ObjectMapper;

import java.io.ByteArrayInputStream;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.*;

class TemplateTextStylesTest {
    private final PresentationTemplateService templates =
            new PresentationTemplateService(new ObjectMapper(), new PresentationContentValidator());

    TemplateTextStylesTest() throws Exception {}

    @Test
    void templateAndCustomTextUseTheSameFormattingInProjectionAndExport() throws Exception {
        var initial = plan(null, null);
        var block = templates.editorDeck("opal", UUID.randomUUID(), "Test", 1, 0, Map.of(), initial)
                .slides().getFirst().blocks().stream().filter(b -> "LIST_1".equals(b.fieldKey())).findFirst().orElseThrow();
        var style = new TextStyle("Georgia", 28, 700, "right", "#224466", true, true);
        var layout = new PresentationContent.TextLayout(block.layoutId(), block.x(), block.y(), block.width(), block.height(), style);
        var custom = new PresentationContent.TextBlock("custom-style", "Custom text", 10, 75, 40, 10, 24, 400, "left", "ink", style);
        var content = plan(layout, custom);
        var projected = templates.editorDeck("opal", UUID.randomUUID(), "Test", 1, 0, Map.of(), content);
        assertThat(projected.slides().getFirst().blocks().stream().filter(b -> b.layoutId() != null && b.layoutId().equals(block.layoutId())))
                .allSatisfy(b -> {
                    assertThat(b.fontFamily()).isEqualTo("Georgia");
                    assertThat(b.fontSize()).isEqualTo(28);
                    assertThat(b.weight()).isEqualTo(700);
                    assertThat(b.align()).isEqualTo("right");
                    assertThat(b.fontColor()).isEqualTo("#224466");
                    assertThat(b.italic()).isTrue();
                    assertThat(b.underline()).isTrue();
                    assertThat(b.textStyle()).isEqualTo(style);
                });
        try (var show = new XMLSlideShow(new ByteArrayInputStream(templates.render("opal", content)))) {
            var shapes = TemplateShapes.allShapes(show.getSlides().getFirst().getShapes()).stream()
                    .filter(XSLFTextShape.class::isInstance).map(XSLFTextShape.class::cast)
                    .filter(s -> s.getText().contains("Text LIST_1") || s.getText().contains("Custom text")).toList();
            assertThat(shapes).hasSize(2);
            for (var shape : shapes) {
                var paragraph = shape.getTextParagraphs().getFirst();
                var run = paragraph.getTextRuns().getFirst();
                assertThat(run.getFontFamily()).isEqualTo("Georgia");
                assertThat(run.getFontSize() * 960 / show.getPageSize().getWidth()).isCloseTo(28, within(0.1));
                assertThat(run.isBold()).isTrue();
                assertThat(run.isItalic()).isTrue();
                assertThat(run.isUnderlined()).isTrue();
                assertThat(paragraph.getTextAlign().name()).isEqualTo("RIGHT");
            }
        }
    }

    @Test
    void absentOverridesPreserveTheSourceAndFalseOverridesDisableFormatting() throws Exception {
        var original = new ObjectMapper().writeValueAsString(plan(null, null));
        var legacy = new ObjectMapper().readValue(original, PresentationContent.class);
        assertThat(templates.normalizeEditor("opal", legacy).slides().get(8).textLayoutsOrEmpty()).isEmpty();
        try (var show = new XMLSlideShow()) {
            var box = show.createSlide().createTextBox();
            var run = box.setText("Text");
            run.setBold(true);
            run.setItalic(true);
            run.setUnderlined(true);
            TemplateTextStyles.apply(box, new TextStyle(null, null, 400, null, null, false, false), 960);
            assertThat(run.isBold()).isFalse();
            assertThat(run.isItalic()).isFalse();
            assertThat(run.isUnderlined()).isFalse();
        }
    }

    @Test
    void unsupportedFormattingIsRejectedBeforeRendering() {
        for (var style : List.of(new TextStyle("Remote font", null, null, null, null, null, null),
                new TextStyle(null, 100, null, null, null, null, null),
                new TextStyle(null, null, 600, null, null, null, null),
                new TextStyle(null, null, null, "justify", null, null, null),
                new TextStyle(null, null, null, null, "red;display:none", null, null))) {
            var custom = new PresentationContent.TextBlock("invalid-style", "Text", 10, 10, 40, 10, 24, 400, "left", "ink", style);
            assertThatThrownBy(() -> templates.normalizeEditor("opal", plan(null, custom))).isInstanceOf(GenerationException.class);
        }
    }

    @Test
    void projectsSourceVerticalAlignmentWithoutMovingOrReformattingTheTemplate() throws Exception {
        var initial = plan(null, null);
        var content = new PresentationContent(initial.fields(), initial.slides().stream()
                .map(slide -> new PresentationContent.Slide(slide.slide(), slide.slide() == 1, "Anchor")).toList());
        var blocks = templates.editorDeck("opal", UUID.randomUUID(), "Anchor", 1, 0, Map.of(), content).slides().getFirst().blocks();
        assertThat(blocks.stream().filter(block -> "TITLE".equals(block.fieldKey())).findFirst().orElseThrow().verticalAlign()).isEqualTo("bottom");
        assertThat(blocks.stream().filter(block -> "SUBTITLE".equals(block.fieldKey())).findFirst().orElseThrow().verticalAlign()).isEqualTo("top");
        try (var show = new XMLSlideShow(new ByteArrayInputStream(templates.render("opal", content)))) {
            var title = TemplateShapes.allShapes(show.getSlides().getFirst().getShapes()).stream()
                    .filter(XSLFTextShape.class::isInstance).map(XSLFTextShape.class::cast)
                    .filter(shape -> shape.getText().equals("Text TITLE")).findFirst().orElseThrow();
            assertThat(title.getVerticalAlignment()).isEqualTo(org.apache.poi.sl.usermodel.VerticalAlignment.BOTTOM);
        }
    }

    private PresentationContent plan(PresentationContent.TextLayout layout, PresentationContent.TextBlock custom) {
        Map<String, String> fields = new LinkedHashMap<>();
        templates.fields("opal").keySet().forEach(key -> fields.put(key, "Text " + key));
        return new PresentationContent(fields, IntStream.rangeClosed(1, 13)
                .mapToObj(n -> new PresentationContent.Slide(n, n == 9, "Style test", false,
                        n == 9 && custom != null ? List.of(custom) : List.of(), List.of(),
                        n == 9 && layout != null ? List.of(layout) : List.of())).toList());
    }
}
