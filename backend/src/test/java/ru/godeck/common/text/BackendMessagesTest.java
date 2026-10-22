package ru.godeck.common.text;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

import ru.godeck.presentation.exception.GenerationError;

class BackendMessagesTest {
    @ParameterizedTest
    @EnumSource(GenerationError.class)
    void everyPublicErrorHasANonEmptyResolvedMessage(GenerationError error) {
        assertThat(error.message()).isNotBlank().doesNotContain("{0}", "{1}");
    }
}
