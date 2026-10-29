package ru.godeck.presentation.aiedit.ai;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.mock;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.env.MockEnvironment;

import ru.godeck.presentation.service.PresentationAiCallHistory;

import tools.jackson.databind.ObjectMapper;

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

    private ScriptedTextEditLlm create(MockEnvironment environment) {
        return new ScriptedTextEditLlm(
                environment,
                new TextEditRequestFactory(json),
                new TextEditResponseParser(json),
                mock(PresentationAiCallHistory.class),
                json);
    }
}
