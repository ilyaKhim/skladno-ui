package ru.godeck.presentation.aiedit.ai;

import java.util.List;
import java.util.Objects;

/**
 * Parsed model answer before deterministic sanitizing.
 *
 * @param supported {@code false} when the model reported the request as out of scope
 * @param message model explanation; meaningful for unsupported requests
 * @param variants raw variant texts in model order; empty for unsupported requests
 */
public record TextEditOutcome(
        boolean supported, String message, List<String> variants, ResponsesUsage usage) {
    public TextEditOutcome {
        variants = List.copyOf(variants);
        usage = Objects.requireNonNullElse(usage, ResponsesUsage.NONE);
    }

    public TextEditOutcome withUsage(ResponsesUsage reported) {
        return new TextEditOutcome(supported, message, variants, reported);
    }
}
