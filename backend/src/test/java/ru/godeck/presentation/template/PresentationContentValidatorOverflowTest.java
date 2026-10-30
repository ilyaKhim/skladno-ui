package ru.godeck.presentation.template;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import ru.godeck.presentation.exception.GenerationException;
import ru.godeck.presentation.model.PresentationContent;

import java.util.List;
import java.util.Map;

/** Editor length policy: full text up to the hard limit, generation paths unchanged. */
class PresentationContentValidatorOverflowTest {
    private final PresentationContentValidator validator = new PresentationContentValidator();

    @ParameterizedTest
    @CsvSource({"7, 107", "46, 146", "170, 340", "3000, 4000", "1, 101", "100, 200", "2000, 4000"})
    void hardLimitFollowsTheContractFormula(int max, int hard) {
        assertThat(EditorTextLimits.hard(max)).isEqualTo(hard);
    }

    @ParameterizedTest
    @ValueSource(ints = {7, 46, 170, 3000})
    void allowOverflowKeepsTextUpToTheHardLimitAndRejectsOneMore(int max) {
        int hard = EditorTextLimits.hard(max);
        String full = "а".repeat(hard);
        var values =
                validator.normalizeValues(
                        Map.of("BODY", full), Map.of("BODY", max), TextLengthMode.ALLOW_OVERFLOW);
        assertThat(values.get("BODY")).isEqualTo(full);
        assertThatThrownBy(
                        () ->
                                validator.normalizeValues(
                                        Map.of("BODY", full + "а"),
                                        Map.of("BODY", max),
                                        TextLengthMode.ALLOW_OVERFLOW))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void allowOverflowDocumentRejectsTextAboveTheHardLimitAsInvalidContent() {
        var ok = content("x".repeat(EditorTextLimits.hard(46)));
        assertThat(
                        validator
                                .normalize(ok, Map.of("TITLE", 46), 1, TextLengthMode.ALLOW_OVERFLOW)
                                .fields()
                                .get("TITLE"))
                .hasSize(146);
        var tooLong = content("x".repeat(EditorTextLimits.hard(46) + 1));
        assertThatThrownBy(
                        () ->
                                validator.normalize(
                                        tooLong,
                                        Map.of("TITLE", 46),
                                        1,
                                        TextLengthMode.ALLOW_OVERFLOW))
                .isInstanceOfSatisfying(
                        GenerationException.class,
                        error -> assertThat(error.code()).isEqualTo("invalid_content"));
    }

    @Test
    void allowOverflowKeepsTheOtherChecks() {
        assertThatThrownBy(
                        () ->
                                validator.normalize(
                                        content("{{TITLE}}"),
                                        Map.of("TITLE", 46),
                                        1,
                                        TextLengthMode.ALLOW_OVERFLOW))
                .isInstanceOf(GenerationException.class);
        assertThatThrownBy(
                        () ->
                                validator.normalize(
                                        content("Текст"),
                                        Map.of("TITLE", 46),
                                        2,
                                        TextLengthMode.ALLOW_OVERFLOW))
                .isInstanceOf(GenerationException.class);
    }

    @Test
    void truncateModeIsTheDefaultAndMatchesTheLegacyOverload() {
        String long_ = "Очень длинный заголовок презентации, который не помещается в поле";
        var legacy = validator.normalize(content(long_), Map.of("TITLE", 20), 1);
        var explicit =
                validator.normalize(content(long_), Map.of("TITLE", 20), 1, TextLengthMode.TRUNCATE);
        assertThat(explicit).isEqualTo(legacy);
        assertThat(legacy.fields().get("TITLE")).hasSizeLessThanOrEqualTo(20).endsWith("…");
        assertThat(
                        validator.normalizeValues(
                                Map.of("TITLE", long_),
                                Map.of("TITLE", 20),
                                TextLengthMode.TRUNCATE))
                .isEqualTo(validator.normalizeValues(Map.of("TITLE", long_), Map.of("TITLE", 20)));
    }

    private static PresentationContent content(String title) {
        return new PresentationContent(
                Map.of("TITLE", title), List.of(new PresentationContent.Slide(1, true, "Test")));
    }
}
