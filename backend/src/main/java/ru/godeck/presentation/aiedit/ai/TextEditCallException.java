package ru.godeck.presentation.aiedit.ai;

import ru.godeck.presentation.aiedit.core.AiEditFailureReason;
import ru.godeck.presentation.exception.AiGenerationException;
import ru.godeck.presentation.exception.GenerationError;

import java.util.Objects;

/**
 * A failed text-edit call with what the journal needs: the internal cause and the tokens already
 * spent. Every handler of {@link AiGenerationException} treats it as {@code ai_edit_failed}.
 */
public class TextEditCallException extends AiGenerationException {
    private final transient AiEditFailureReason failureReason;
    private final transient ResponsesUsage usage;

    public TextEditCallException(
            AiEditFailureReason failureReason, ResponsesUsage usage, Throwable cause) {
        super(GenerationError.AI_EDIT_FAILED, cause);
        this.failureReason = failureReason;
        this.usage = Objects.requireNonNullElse(usage, ResponsesUsage.NONE);
    }

    public AiEditFailureReason failureReason() {
        return failureReason;
    }

    public ResponsesUsage usage() {
        return usage;
    }
}
