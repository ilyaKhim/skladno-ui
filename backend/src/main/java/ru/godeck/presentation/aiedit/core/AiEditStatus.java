package ru.godeck.presentation.aiedit.core;

import com.fasterxml.jackson.annotation.JsonValue;

import java.util.Locale;

/**
 * Journal status of one AI edit. {@code OK}, {@code UNCHANGED} and {@code ALTERNATIVE} are also the
 * public {@code status} of a successful response. {@code UNSUPPORTED} is no longer produced: it stays
 * for old journal rows and their replays.
 */
public enum AiEditStatus {
    RUNNING,
    OK,
    UNCHANGED,
    UNSUPPORTED,
    ALTERNATIVE,
    FAILED;

    @JsonValue
    public String value() {
        return name().toLowerCase(Locale.ROOT);
    }

    /** True for statuses whose stored response may be replayed for the same request id. */
    public boolean replayable() {
        return this == OK || this == UNCHANGED || this == UNSUPPORTED || this == ALTERNATIVE;
    }
}
