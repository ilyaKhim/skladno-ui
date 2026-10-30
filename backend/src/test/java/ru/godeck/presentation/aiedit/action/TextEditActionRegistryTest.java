package ru.godeck.presentation.aiedit.action;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.Test;

import ru.godeck.presentation.aiedit.action.builtin.CustomAction;
import ru.godeck.presentation.aiedit.action.builtin.RephraseAction;
import ru.godeck.presentation.aiedit.action.builtin.ShortenAction;
import ru.godeck.presentation.aiedit.core.AiEditContext;
import ru.godeck.presentation.aiedit.core.ResolvedTextTarget;
import ru.godeck.presentation.aiedit.core.TargetKind;
import ru.godeck.presentation.exception.GenerationException;

import tools.jackson.databind.ObjectMapper;

import java.io.InputStream;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

class TextEditActionRegistryTest {
    private final ObjectMapper json = new ObjectMapper();
    private final TextEditActionRegistry registry = builtin();

    static TextEditActionRegistry builtin() {
        return new TextEditActionRegistry(
                List.of(new ShortenAction(), new RephraseAction(), new CustomAction()));
    }

    @Test
    void catalogMatchesTheContractExample() throws Exception {
        String actual = json.writeValueAsString(registry.catalog(new AiEditContext(null, null), true));
        try (InputStream snapshot =
                getClass().getClassLoader().getResourceAsStream("golden/ai-edit-actions.json")) {
            assertThat(json.readTree(actual)).isEqualTo(json.readTree(snapshot.readAllBytes()));
        }
        assertThat(actual).doesNotContain("change_tone");
    }

    @Test
    void catalogReportsDisabledAiWithoutHidingActions() {
        var catalog = registry.catalog(new AiEditContext(null, null), false);
        assertThat(catalog.enabled()).isFalse();
        assertThat(catalog.actions()).extracting("id").containsExactly("shorten", "rephrase", "custom");
    }

    @Test
    void rejectsDuplicateIds() {
        assertThatThrownBy(
                        () ->
                                new TextEditActionRegistry(
                                        List.of(
                                                new ShortenAction(),
                                                new ShortenAction(),
                                                new CustomAction())))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("duplicate");
    }

    @Test
    void requiresExactlyOneInputAction() {
        assertThatThrownBy(() -> new TextEditActionRegistry(List.of(new ShortenAction())))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(
                        () ->
                                new TextEditActionRegistry(
                                        List.of(new CustomAction(), new SecondInput())))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void unknownOrUnavailableActionIsUnsupported() {
        assertThat(code(() -> registry.require("change_tone", TargetKind.TEMPLATE_FIELD, null)))
                .isEqualTo("unsupported_action");
        var limited =
                new TextEditActionRegistry(List.of(new CustomAction(), new FieldOnlyEnum()));
        assertThat(code(() -> limited.require("tone", TargetKind.CUSTOM_BLOCK, null)))
                .isEqualTo("unsupported_action");
        assertThat(limited.require("tone", TargetKind.TEMPLATE_FIELD, null).id()).isEqualTo("tone");
    }

    @Test
    void validatesParametersStrictly() {
        TextEditAction custom = registry.require("custom", TargetKind.TEMPLATE_FIELD, null);
        assertThat(registry.validate(custom, Map.of("instruction", "  сделай формальнее ")))
                .containsExactly(Map.entry("instruction", "сделай формальнее"));
        assertThat(code(() -> registry.validate(custom, Map.of()))).isEqualTo("invalid_params");
        assertThat(code(() -> registry.validate(custom, Map.of("instruction", "   "))))
                .isEqualTo("invalid_params");
        assertThat(code(() -> registry.validate(custom, Map.of("instruction", "а".repeat(301)))))
                .isEqualTo("invalid_params");
        assertThat(registry.validate(custom, Map.of("instruction", "а".repeat(300)))).hasSize(1);
        assertThat(
                        code(
                                () ->
                                        registry.validate(
                                                custom,
                                                Map.of("instruction", "ok", "tone", "formal"))))
                .isEqualTo("invalid_params");
        var withNull = new HashMap<String, String>();
        withNull.put("instruction", null);
        assertThat(code(() -> registry.validate(custom, withNull))).isEqualTo("invalid_params");

        TextEditAction shorten = registry.require("shorten", TargetKind.CUSTOM_BLOCK, null);
        assertThat(registry.validate(shorten, null)).isEmpty();
        assertThat(code(() -> registry.validate(shorten, Map.of("x", "y"))))
                .isEqualTo("invalid_params");

        var enumRegistry = new TextEditActionRegistry(List.of(new CustomAction(), new FieldOnlyEnum()));
        TextEditAction tone = enumRegistry.require("tone", TargetKind.TEMPLATE_FIELD, null);
        assertThat(enumRegistry.validate(tone, Map.of("tone", "formal"))).containsEntry("tone", "formal");
        assertThat(code(() -> enumRegistry.validate(tone, Map.of("tone", "pirate"))))
                .isEqualTo("invalid_params");
    }

    @Test
    void enumParametersAppearInTheCatalogWithOptions() {
        var catalog =
                new TextEditActionRegistry(List.of(new CustomAction(), new FieldOnlyEnum()))
                        .catalog(new AiEditContext(null, null), true);
        var tone = json.valueToTree(catalog).path("actions").get(1);
        assertThat(tone.path("targets").toString()).isEqualTo("[\"template_field\"]");
        assertThat(tone.path("params").get(0).path("type").asText()).isEqualTo("enum");
        assertThat(tone.path("params").get(0).path("max_length").isNull()).isTrue();
        assertThat(tone.path("params").get(0).path("options").get(0).path("label").asText())
                .isEqualTo("Сократить");
    }

    private static String code(Runnable call) {
        try {
            call.run();
        } catch (GenerationException error) {
            return error.code();
        }
        throw new AssertionError("expected GenerationException");
    }

    /** Second INPUT action: the registry must refuse it. */
    private static final class SecondInput extends CustomAction {
        @Override
        public String id() {
            return "other_input";
        }
    }

    /** Field-only quick action with an enum parameter, to test generic validation. */
    private static final class FieldOnlyEnum implements TextEditAction {
        public String id() {
            return "tone";
        }

        public String labelKey() {
            return "presentation.ai-edit.action.shorten.label";
        }

        public String descriptionKey() {
            return "presentation.ai-edit.action.shorten.description";
        }

        public ActionUi ui() {
            return ActionUi.QUICK;
        }

        public List<ActionParam> params() {
            return List.of(
                    ActionParam.choice(
                            "tone",
                            true,
                            List.of(
                                    new ActionParam.Option(
                                            "formal", "presentation.ai-edit.action.shorten.label"))));
        }

        public Set<TargetKind> targets() {
            return Set.of(TargetKind.TEMPLATE_FIELD);
        }

        public String task(Map<String, String> params, ResolvedTextTarget target) {
            return "Тон.";
        }
    }
}
