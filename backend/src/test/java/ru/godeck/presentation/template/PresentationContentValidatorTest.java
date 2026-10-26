package ru.godeck.presentation.template;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import ru.godeck.presentation.exception.GenerationException;
import ru.godeck.presentation.model.PresentationContent;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

class PresentationContentValidatorTest {
    private final PresentationContentValidator validator = new PresentationContentValidator();

    @ParameterizedTest
    @ValueSource(ints = {1, 2, 3, 4, 5, 12, 80})
    void truncationNeverSplitsEmojiEvenWithVerySmallJsonLimits(int limit) {
        var values =
                validator.normalizeValues(
                        Map.of("TITLE", "😀".repeat(100)), Map.of("TITLE", limit));
        String title = values.get("TITLE");
        assertThat(title.length()).isLessThanOrEqualTo(limit);
        assertThat(title.codePoints().anyMatch(cp -> cp >= 0xD800 && cp <= 0xDFFF)).isFalse();
    }

    @Test
    void validatesDecisionsAndPreservesExplicitlyIncludedEmptySlidesWithoutPptxIo() {
        var input =
                new PresentationContent(
                        Map.of("TITLE", ""),
                        List.of(new PresentationContent.Slide(1, true, "Model requested it")));
        assertThat(validator.normalize(input, Map.of("TITLE", 80), 1).slideCount()).isEqualTo(1);
    }

    @Test
    void rejectsMissingDecisionsRatherThanSilentlyFillingThem() {
        var input =
                new PresentationContent(
                        Map.of("TITLE", "Title"),
                        List.of(new PresentationContent.Slide(1, true, "Title")));
        assertThatThrownBy(() -> validator.normalize(input, Map.of("TITLE", 80), 2))
                .isInstanceOf(GenerationException.class);
    }

    @Test
    void neverMutatesTheSuppliedFieldValues() {
        var values = new LinkedHashMap<>(Map.of("TITLE", "Long title"));
        assertThat(validator.normalizeValues(values, Map.of("TITLE", 4)).get("TITLE"))
                .hasSizeLessThanOrEqualTo(4);
        assertThat(values).containsEntry("TITLE", "Long title");
    }

    @Test
    void validatesAndPreservesFreeformTextBlocks() {
        var block =
                new PresentationContent.TextBlock(
                        "text-1", "Новый текст", 12, 18, 36, 14, 24, 700, "center", "brand");
        var input =
                new PresentationContent(
                        Map.of("TITLE", "Title"),
                        List.of(
                                new PresentationContent.Slide(
                                        1, true, "Title", false, List.of(block))));

        assertThat(
                        validator
                                .normalize(input, Map.of("TITLE", 80), 1)
                                .slides()
                                .getFirst()
                                .textBlocksOrEmpty())
                .containsExactly(block);
    }

    @Test
    void rejectsFreeformTextBlocksOutsideTheSlide() {
        var block =
                new PresentationContent.TextBlock(
                        "text-1", "Новый текст", 90, 18, 36, 14, 24, 400, "left", "ink");
        var input =
                new PresentationContent(
                        Map.of("TITLE", "Title"),
                        List.of(
                                new PresentationContent.Slide(
                                        1, true, "Title", false, List.of(block))));

        assertThatThrownBy(() -> validator.normalize(input, Map.of("TITLE", 80), 1))
                .isInstanceOf(GenerationException.class);
    }

    @Test
    void validatesAndPreservesImageBlocks() {
        var image =
                new PresentationContent.ImageBlock(
                        "image-1", UUID.randomUUID().toString(), "Диаграмма", 10, 12, 40, 35);
        var input =
                new PresentationContent(
                        Map.of("TITLE", "Title"),
                        List.of(
                                new PresentationContent.Slide(
                                        1, true, "Title", false, List.of(), List.of(image))));

        assertThat(
                        validator
                                .normalize(input, Map.of("TITLE", 80), 1)
                                .slides()
                                .getFirst()
                                .imageBlocksOrEmpty())
                .containsExactly(image);
    }

    @Test
    void rejectsImageBlocksWithUnknownAssetsOrGeometryOutsideTheSlide() {
        for (var image :
                List.of(
                        new PresentationContent.ImageBlock(
                                "image-1", "not-a-uuid", "", 10, 10, 20, 20),
                        new PresentationContent.ImageBlock(
                                "image-2", UUID.randomUUID().toString(), "", 90, 10, 20, 20))) {
            var input =
                    new PresentationContent(
                            Map.of("TITLE", "Title"),
                            List.of(
                                    new PresentationContent.Slide(
                                            1, true, "Title", false, List.of(), List.of(image))));
            assertThatThrownBy(() -> validator.normalize(input, Map.of("TITLE", 80), 1))
                    .isInstanceOf(GenerationException.class);
        }
    }

    @Test
    void rejectsDuplicateElementIdsAcrossTextAndImages() {
        var text =
                new PresentationContent.TextBlock(
                        "element-1", "Text", 10, 10, 20, 10, 16, 400, "left", "ink");
        var image =
                new PresentationContent.ImageBlock(
                        "element-1", UUID.randomUUID().toString(), "", 40, 10, 20, 20);
        var input =
                new PresentationContent(
                        Map.of("TITLE", "Title"),
                        List.of(
                                new PresentationContent.Slide(
                                        1, true, "Title", false, List.of(text), List.of(image))));

        assertThatThrownBy(() -> validator.normalize(input, Map.of("TITLE", 80), 1))
                .isInstanceOf(GenerationException.class);
    }

    @Test
    void validatesTemplateTextLayoutsAndRejectsInvalidGeometry() {
        var layout = new PresentationContent.TextLayout("slide-1-layout-1", 12, 18, 36, 14);
        var valid =
                new PresentationContent(
                        Map.of("TITLE", "Title"),
                        List.of(
                                new PresentationContent.Slide(
                                        1,
                                        true,
                                        "Title",
                                        false,
                                        List.of(),
                                        List.of(),
                                        List.of(layout))));

        assertThat(
                        validator
                                .normalize(valid, Map.of("TITLE", 80), 1)
                                .slides()
                                .getFirst()
                                .textLayoutsOrEmpty())
                .containsExactly(layout);

        var invalid =
                new PresentationContent(
                        Map.of("TITLE", "Title"),
                        List.of(
                                new PresentationContent.Slide(
                                        1,
                                        true,
                                        "Title",
                                        false,
                                        List.of(),
                                        List.of(),
                                        List.of(
                                                new PresentationContent.TextLayout(
                                                        "slide-1-layout-1", 90, 18, 36, 14)))));
        assertThatThrownBy(() -> validator.normalize(invalid, Map.of("TITLE", 80), 1))
                .isInstanceOf(GenerationException.class);
    }
}
