package ru.godeck.presentation.aiedit.core;

import com.fasterxml.jackson.annotation.JsonValue;

import java.util.Locale;
import java.util.Optional;

/** Why a request got an {@code alternative} instead of a variant; stable in the API and journal. */
public enum AlternativeReason {
    NEEDS_SOURCE,
    STYLE_PANEL,
    OUT_OF_SCOPE,
    ADVICE,
    CLARIFY;

    @JsonValue
    public String value() {
        return name().toLowerCase(Locale.ROOT);
    }

    /** Parses a model value; unknown values are empty rather than an exception. */
    public static Optional<AlternativeReason> parse(String value) {
        for (AlternativeReason reason : values())
            if (reason.value().equals(value)) return Optional.of(reason);
        return Optional.empty();
    }
}
