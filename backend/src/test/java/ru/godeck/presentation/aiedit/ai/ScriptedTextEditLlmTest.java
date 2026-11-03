package ru.godeck.presentation.aiedit.ai;

import static ru.godeck.support.TestSettings.defaults;
import ru.godeck.presentation.aiedit.config.TextEditPromptSettings;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.mock;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.env.MockEnvironment;

import ru.godeck.presentation.ai.PresentationAiCallHistory;
import ru.godeck.presentation.aiedit.core.AiEditFailureReason;
import ru.godeck.presentation.aiedit.core.AlternativeReason;

import tools.jackson.databind.ObjectMapper;

import java.util.UUID;

/** The stub must never be usable outside test profiles. */
class ScriptedTextEditLlmTest {
    private final ObjectMapper json = new ObjectMapper();

    @Test
    void refusesToStartOutsideTestProfiles() {
        var production = new MockEnvironment();
        production.setActiveProfiles("prod");
        assertThatThrownBy(() -> create(production)).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> create(new MockEnvironment())).isInstanceOf(IllegalStateException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {"test", "e2e"})
    void startsInTestAndE2eProfiles(String profile) {
        var environment = new MockEnvironment();
        environment.setActiveProfiles(profile);
        assertThat(create(environment).enabled()).isTrue();
    }

    @Test
    void fillerHasTheExactLengthAndNoEdgeSpaces() {
        for (int length : new int[] {1, 23, 59, 166}) {
            String text = ScriptedTextEditLlm.filler(length);
            assertThat(text).hasSize(length);
            assertThat(text.strip()).isEqualTo(text);
        }
    }

    @Test
    void markersAreReadOnlyFromTheRequest() {
        var llm = create(testProfile());
        assertThat(llm.edit(prompt(ScriptedTextEditLlm.ALT_SOURCE, "Текст блока")).reason())
                .isEqualTo(AlternativeReason.NEEDS_SOURCE);
        assertThat(llm.edit(prompt(ScriptedTextEditLlm.ALT_STYLE, "Текст блока")).reason())
                .isEqualTo(AlternativeReason.STYLE_PANEL);
        assertThat(llm.edit(prompt(ScriptedTextEditLlm.ALT_SCOPE, "Текст блока")).reason())
                .isEqualTo(AlternativeReason.OUT_OF_SCOPE);
        assertThat(llm.edit(prompt(ScriptedTextEditLlm.ADVICE, "Текст блока")).reason())
                .isEqualTo(AlternativeReason.ADVICE);
        assertThat(llm.edit(prompt(ScriptedTextEditLlm.CLARIFY, "Текст блока")).reason())
                .isEqualTo(AlternativeReason.CLARIFY);
        var plain = llm.edit(prompt("перескажи в виде анекдота про слайд", ScriptedTextEditLlm.ALT_SOURCE + " текст"));
        assertThat(plain.alternative()).isFalse();
        assertThat(plain.variants()).hasSize(1);
    }

    @Test
    void scenariosThatDisobeyThePromptStillParse() {
        var llm = create(testProfile());
        assertThat(llm.edit(prompt(ScriptedTextEditLlm.FAKE_QUOTE, "Текст")).variants().getFirst().text()).contains("«");
        assertThat(llm.edit(prompt(ScriptedTextEditLlm.FAKE_STAT, "Текст")).variants().getFirst().text()).contains("37 %");
        assertThat(llm.edit(prompt(ScriptedTextEditLlm.CHECK_FACTS, "Текст")).variants().getFirst().checkFacts()).isTrue();
        var empty = llm.edit(prompt(ScriptedTextEditLlm.NO_SUGGESTIONS, "Текст"));
        assertThat(empty.message()).isEmpty();
        assertThat(empty.suggestions()).isEmpty();
    }

    @Test
    void emptySourceGetsNewText() {
        assertThat(create(testProfile()).edit(prompt("заполни этот блок", "")).variants().getFirst().text())
                .isEqualTo(ScriptedTextEditLlm.EMPTY_SOURCE_TEXT);
    }

    @Test
    void incompleteEnvelopeKeepsItsUsage() {
        assertThatThrownBy(() -> create(testProfile()).edit(prompt(ScriptedTextEditLlm.INCOMPLETE, "Текст")))
                .isInstanceOfSatisfying(
                        TextEditCallException.class,
                        failure -> {
                            assertThat(failure.failureReason()).isEqualTo(AiEditFailureReason.MAX_OUTPUT);
                            assertThat(failure.usage().reasoningTokens())
                                    .isEqualTo(ScriptedTextEditLlm.INCOMPLETE_REASONING_TOKENS);
                        });
    }

    private static MockEnvironment testProfile() {
        var environment = new MockEnvironment();
        environment.setActiveProfiles("test");
        return environment;
    }

    private static TextEditPrompt prompt(String request, String text) {
        return new TextEditPrompt(
                UUID.randomUUID(), "gpt-5.4-mini", "custom", "task", 110, 220, null, null, null, request, 1, text);
    }

    private ScriptedTextEditLlm create(MockEnvironment environment) {
        return new ScriptedTextEditLlm(
                environment,
                new TextEditRequestFactory(json, defaults(TextEditPromptSettings.class)),
                new TextEditResponseParser(json),
                mock(PresentationAiCallHistory.class),
                json);
    }
}
