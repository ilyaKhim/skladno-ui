package ru.godeck.presentation.model;

import com.fasterxml.jackson.annotation.JsonValue;

import java.util.Locale;

public enum PresentationStatus {
    AWAITING_CONTENT,
    DRAFT,
    QUEUED,
    RUNNING,
    SUCCEEDED,
    FAILED,
    CANCELLED;

    @JsonValue
    public String value() {
        return name().toLowerCase(Locale.ROOT);
    }
}
