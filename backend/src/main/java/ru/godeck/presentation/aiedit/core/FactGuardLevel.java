package ru.godeck.presentation.aiedit.core;

import java.util.Locale;

/** Strongest {@code FactGuard} action on one answer; ordered from weakest to strongest. */
public enum FactGuardLevel {
    NONE,
    FLAGGED,
    BLOCKED;

    public String value() {
        return name().toLowerCase(Locale.ROOT);
    }

    public FactGuardLevel strongest(FactGuardLevel other) {
        return compareTo(other) >= 0 ? this : other;
    }
}
