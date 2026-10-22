package ru.godeck.presentation;

import com.fasterxml.jackson.annotation.JsonValue;

import java.util.Locale;

public enum GenerationMode {
    OPENAI,
    MANUAL;

    @JsonValue
    public String value() {
        return name().toLowerCase(Locale.ROOT);
    }
}
