package ru.godeck.presentation.template;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import ru.godeck.presentation.exception.GenerationException;
import ru.godeck.presentation.model.PresentationContent;

import java.util.*;

class PresentationContentValidationTest {
    private static PresentationTemplateService templates;

    @BeforeAll
    static void setUp() throws Exception {
        templates =
                new PresentationTemplateService(
                        new tools.jackson.databind.ObjectMapper(),
                        new PresentationContentValidator());
    }

    private Map<String, String> fields() {
        Map<String, String> fields = new LinkedHashMap<>();
        templates.fields().keySet().forEach(k -> fields.put(k, "Текст"));
        return fields;
    }

    private List<PresentationContent.Slide> slides() {
        var slides = new ArrayList<PresentationContent.Slide>();
        for (int n = 1; n <= templates.slideManifest().size(); n++)
            slides.add(new PresentationContent.Slide(n, n == 1, "Test"));
        return slides;
    }

    @ParameterizedTest
    @ValueSource(strings = {"missing", "extra", "null", "marker-open", "marker-close"})
    void rejectsInvalidFieldSetsAndUnresolvedMarkers(String kind) {
        var fields = fields();
        String first = fields.keySet().iterator().next();
        switch (kind) {
            case "missing" -> fields.remove(first);
            case "extra" -> fields.put("NOT_IN_TEMPLATE", "text");
            case "null" -> fields.put(first, null);
            case "marker-open" -> fields.put(first, "{{UNRESOLVED");
            case "marker-close" -> fields.put(first, "UNRESOLVED}}");
        }
        assertInvalid(new PresentationContent(fields, slides()));
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "duplicate",
                "zero",
                "outside",
                "null-include",
                "empty-reason",
                "null-slide",
                "none",
                "missing"
            })
    void rejectsInvalidSlideSelections(String kind) {
        var slides = slides();
        switch (kind) {
            case "duplicate" -> slides.set(1, slides.getFirst());
            case "zero" -> slides.set(0, new PresentationContent.Slide(0, true, "Test"));
            case "outside" -> slides.set(0, new PresentationContent.Slide(999, true, "Test"));
            case "null-include" -> slides.set(0, new PresentationContent.Slide(1, null, "Test"));
            case "empty-reason" -> slides.set(0, new PresentationContent.Slide(1, true, " "));
            case "null-slide" -> slides.set(0, null);
            case "none" -> slides.set(0, new PresentationContent.Slide(1, false, "Test"));
            case "missing" -> slides.removeLast();
        }
        assertInvalid(new PresentationContent(fields(), slides));
    }

    @Test
    void truncationNeverCutsASurrogatePairAndStaysWithinFieldLimits() {
        var fields = fields();
        fields.replaceAll((key, value) -> "😀".repeat(1000));
        var normalized = templates.normalize(new PresentationContent(fields, slides()));
        normalized
                .fields()
                .forEach(
                        (key, value) -> {
                            assertThat(value.length())
                                    .isLessThanOrEqualTo(templates.fields().get(key));
                            assertThat(
                                            value.codePoints()
                                                    .anyMatch(cp -> cp >= 0xD800 && cp <= 0xDFFF))
                                    .isFalse();
                        });
    }

    @Test
    void normalizedPlanDoesNotShareMutableCollectionsWithTheRequest() {
        var fields = fields();
        var slides = slides();
        String first = fields.keySet().iterator().next();
        var plan = templates.normalize(new PresentationContent(fields, slides));
        fields.put(first, "Changed");
        slides.clear();
        assertThat(plan.fields().get(first)).isEqualTo("Текст");
        assertThat(plan.slides()).isNotEmpty();
        assertThatThrownBy(() -> plan.fields().put(first, "Other"))
                .isInstanceOf(UnsupportedOperationException.class);
        assertThatThrownBy(() -> plan.slides().clear())
                .isInstanceOf(UnsupportedOperationException.class);
    }

    private void assertInvalid(PresentationContent content) {
        assertThatThrownBy(() -> templates.normalize(content))
                .isInstanceOf(GenerationException.class)
                .extracting(e -> ((GenerationException) e).code())
                .isEqualTo("invalid_content");
    }
}
