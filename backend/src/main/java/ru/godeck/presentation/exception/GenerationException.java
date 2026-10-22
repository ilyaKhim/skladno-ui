package ru.godeck.presentation.exception;

public class GenerationException extends RuntimeException {
    private final GenerationError error;

    public GenerationException(GenerationError error) {
        super(error.message());
        this.error = error;
    }

    public int status() {
        return error.status().value();
    }

    public String code() {
        return error.code();
    }
}
