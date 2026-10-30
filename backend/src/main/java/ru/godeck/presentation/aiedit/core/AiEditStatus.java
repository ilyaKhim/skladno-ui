package ru.godeck.presentation.aiedit.core;

import com.fasterxml.jackson.annotation.JsonValue;

import java.util.Locale;

/**
 * Journal status of one AI edit. {@code OK}, {@code UNCHANGED} and {@code UNSUPPORTED} are also the
 * public {@code status} of a successful response.
 */
public enum AiEditStatus {
    RUNNING,
    OK,
    UNCHANGED,
    UNSUPPORTED,
    FAILED;

    @JsonValue
    public String value() {
        return name().toLowerCase(Locale.ROOT);
    }

    /** True for statuses whose stored response may be replayed for the same request id. */
    public boolean replayable() {
        return this == OK || this == UNCHANGED || this == UNSUPPORTED;
    }
}
