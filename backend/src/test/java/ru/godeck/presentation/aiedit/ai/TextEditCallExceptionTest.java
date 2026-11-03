package ru.godeck.presentation.aiedit.ai;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.Test;

import ru.godeck.presentation.aiedit.core.AiEditFailureReason;
import ru.godeck.presentation.exception.AiGenerationException;
import ru.godeck.presentation.exception.GenerationError;

/** The subclass must stay invisible to every handler written for the parent. */
class TextEditCallExceptionTest {
    @Test
    void behavesLikeTheParentWithTheEditError() {
        var cause = new IllegalStateException("provider");
        AiGenerationException failure = new TextEditCallException(AiEditFailureReason.SCHEMA, null, cause);
        assertThat(failure.error()).isEqualTo(GenerationError.AI_EDIT_FAILED);
        assertThat(failure.getMessage()).isEqualTo("ai_edit_failed");
        assertThat(failure.getCause()).isSameAs(cause);
    }

    @Test
    void missingUsageIsNone() {
        assertThat(new TextEditCallException(AiEditFailureReason.TIMEOUT, null, null).usage())
                .isEqualTo(ResponsesUsage.NONE);
    }

    @Test
    void parentKeepsItsOwnBehaviourForGeneration() {
        var failure = new AiGenerationException(GenerationError.GENERATION_INCOMPLETE);
        assertThat(failure.error()).isEqualTo(GenerationError.GENERATION_INCOMPLETE);
        assertThat(failure.getMessage()).isEqualTo("generation_incomplete");
        assertThat(failure).isNotInstanceOf(TextEditCallException.class);
    }
}
