package ru.godeck.presentation.aiedit.core;

import java.util.Locale;
import java.util.Optional;

/** What the user did with a proposal; common to every kind of journal record. */
public enum AiEditOutcome {
    APPLIED,
    REJECTED,
    REVERTED;

    public String value() {
        return name().toLowerCase(Locale.ROOT);
    }

    /** Parses the API value; unknown values are empty rather than an exception. */
    public static Optional<AiEditOutcome> parse(String value) {
        for (AiEditOutcome outcome : values())
            if (outcome.value().equals(value)) return Optional.of(outcome);
        return Optional.empty();
    }
}
