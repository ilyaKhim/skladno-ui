package ru.godeck.presentation.exception;

/** A provider failure identified by a code, independent of its HTTP representation. */
public final class AiGenerationException extends RuntimeException {
    private final GenerationError error;

    public AiGenerationException(GenerationError error) {
        this(error, null);
    }

    public AiGenerationException(GenerationError error, Throwable cause) {
        super(error.code(), cause);
        this.error = error;
    }

    public GenerationError error() {
        return error;
    }
}
