package ru.godeck.presentation.model;

import java.util.Objects;
import java.util.UUID;

public record AiCallContext(UUID presentationId, AiOperation operation) {
    public AiCallContext {
        Objects.requireNonNull(presentationId);
        Objects.requireNonNull(operation);
    }
}
