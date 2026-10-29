package ru.godeck.presentation.aiedit.core;

import com.fasterxml.jackson.annotation.JsonValue;

import java.util.Locale;
import java.util.Optional;

/** Kind of editor block an AI text edit applies to; stable in the API and the journal. */
public enum TargetKind {
    TEMPLATE_FIELD,
    CUSTOM_BLOCK;

    @JsonValue
    public String value() {
        return name().toLowerCase(Locale.ROOT);
    }

    /** Parses the API value; unknown values are empty rather than an exception. */
    public static Optional<TargetKind> parse(String value) {
        for (TargetKind kind : values()) if (kind.value().equals(value)) return Optional.of(kind);
        return Optional.empty();
    }
}
