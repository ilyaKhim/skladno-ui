package ru.godeck.presentation.aiedit.ai;

import ru.godeck.presentation.aiedit.core.AlternativeReason;

import java.util.List;
import java.util.Objects;

/**
 * Parsed model answer before deterministic sanitizing.
 *
 * @param reason why the model offered an alternative; {@code null} for an ordinary answer
 * @param message model reply; meaningful for alternatives
 * @param suggestions raw follow-up requests; empty for an ordinary answer
 * @param variants raw variants in model order; empty for alternatives
 */
public record TextEditOutcome(
        AlternativeReason reason,
        String message,
        List<String> suggestions,
        List<Variant> variants,
        ResponsesUsage usage) {
    public TextEditOutcome {
        suggestions = List.copyOf(suggestions);
        variants = List.copyOf(variants);
        usage = Objects.requireNonNullElse(usage, ResponsesUsage.NONE);
    }

    public boolean alternative() {
        return reason != null;
    }

    public TextEditOutcome withUsage(ResponsesUsage reported) {
        return new TextEditOutcome(reason, message, suggestions, variants, reported);
    }

    /**
     * @param text raw variant text
     * @param checkFacts the model added a well-known fact that the user should verify
     */
    public record Variant(String text, boolean checkFacts) {}
}
