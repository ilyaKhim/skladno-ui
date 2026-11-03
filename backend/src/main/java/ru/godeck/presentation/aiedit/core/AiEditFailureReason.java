package ru.godeck.presentation.aiedit.core;

import java.util.Locale;

/**
 * Internal cause of a failed edit, for the journal only: the public error stays {@code
 * ai_edit_failed}. Provider text never reaches the journal, it is reduced to these constants.
 */
public enum AiEditFailureReason {
    MAX_OUTPUT("max_output_tokens"),
    CONTENT_FILTER("content_filter"),
    INCOMPLETE_OTHER("other"),
    TIMEOUT(null),
    PROVIDER_HTTP(null),
    SCHEMA(null),
    INTERNAL(null);

    private final String incompleteReason;

    AiEditFailureReason(String incompleteReason) {
        this.incompleteReason = incompleteReason;
    }

    public String value() {
        return name().toLowerCase(Locale.ROOT);
    }

    /** {@code incomplete_reason} of the journal, or {@code null} if the answer was not incomplete. */
    public String incompleteReason() {
        return incompleteReason;
    }

    /** Whitelist of {@code incomplete_details.reason}: anything else is {@code incomplete_other}. */
    public static AiEditFailureReason ofIncomplete(String providerReason) {
        if (MAX_OUTPUT.incompleteReason.equals(providerReason)) return MAX_OUTPUT;
        if (CONTENT_FILTER.incompleteReason.equals(providerReason)) return CONTENT_FILTER;
        return INCOMPLETE_OTHER;
    }
}
