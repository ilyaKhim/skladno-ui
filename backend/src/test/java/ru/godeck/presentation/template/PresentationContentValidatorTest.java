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
}
