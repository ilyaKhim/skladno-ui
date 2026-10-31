package ru.godeck.presentation.aiedit.action;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import ru.godeck.presentation.exception.GenerationException;

import tools.jackson.databind.ObjectMapper;

import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

class TextEditActionCatalogTest {
    private final ObjectMapper json = new ObjectMapper();
    private final TextEditActionCatalog catalog = new TextEditActionCatalog();

    @Test
    void catalogMatchesTheExistingFrontendContract() throws Exception {
        try (InputStream snapshot = getClass().getClassLoader()
                .getResourceAsStream("golden/ai-edit-actions.json")) {
            tools.jackson.databind.JsonNode actual = json.valueToTree(catalog.catalog(true));
            assertThat(actual)
                    .isEqualTo(json.readTree(snapshot.readAllBytes()));
        }
        assertThat(catalog.catalog(false).enabled()).isFalse();
        assertThat(catalog.catalog(false).actions()).extracting("id")
                .containsExactly("shorten", "rephrase", "custom");
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"change_tone", "SHORTEN", " shorten"})
    void unknownActionsRemainUnsupported(String action) {
        assertThatThrownBy(() -> catalog.require(action)).isInstanceOfSatisfying(
                GenerationException.class, error -> assertThat(error.code()).isEqualTo("unsupported_action"));
    }

    @Test
    void resolvesAllSupportedActions() {
        for (TextEditAction action : TextEditAction.values())
            assertThat(catalog.require(action.id())).isSameAs(action);
    }

    @Test
    void validatesTheCustomInstructionAndNormalizesWhitespace() {
        assertThat(catalog.validate(TextEditAction.CUSTOM, Map.of("instruction", "  формальнее \n")))
                .containsExactly(Map.entry("instruction", "формальнее"));
        assertThat(catalog.validate(TextEditAction.CUSTOM, Map.of("instruction", "а".repeat(300))))
                .hasSize(1);
        invalid(TextEditAction.CUSTOM, null);
        invalid(TextEditAction.CUSTOM, Map.of());
        invalid(TextEditAction.CUSTOM, Map.of("instruction", " \n"));
        invalid(TextEditAction.CUSTOM, Map.of("instruction", "а".repeat(301)));
        invalid(TextEditAction.CUSTOM, Map.of("instruction", "ok", "tone", "formal"));
        invalid(TextEditAction.CUSTOM, Map.of("unknown", "ok"));
        var withNull = new HashMap<String, String>();
        withNull.put("instruction", null);
        invalid(TextEditAction.CUSTOM, withNull);
    }

    @Test
    void quickActionsAcceptNoParameters() {
        for (TextEditAction action : new TextEditAction[] {TextEditAction.SHORTEN, TextEditAction.REPHRASE}) {
            assertThat(catalog.validate(action, null)).isEmpty();
            assertThat(catalog.validate(action, Map.of())).isEmpty();
            invalid(action, Map.of("instruction", "ok"));
        }
    }

    private void invalid(TextEditAction action, Map<String, String> params) {
        assertThatThrownBy(() -> catalog.validate(action, params)).isInstanceOfSatisfying(
                GenerationException.class, error -> assertThat(error.code()).isEqualTo("invalid_params"));
    }
}
