package ru.godeck.presentation.template;

/**
 * Hard text limits accepted by the visual editor.
 *
 * <p>{@code max_chars} of a template field is a layout hint; the editor may store longer text and
 * warn about it. The hard limit still bounds storage and protects a slide from unbounded text.
 * Lengths are UTF-16 code units, the same unit as {@link String#length()} and JavaScript.
 */
public final class EditorTextLimits {
    /** Absolute ceiling for any editor text; also the limit of user-created text blocks. */
    public static final int ABSOLUTE_MAX = 4_000;
    private static final int OVERFLOW_FACTOR = 2;
    private static final int MIN_OVERFLOW = 100;

    private EditorTextLimits() {}

    /** Returns {@code min(4000, max(2 × max, max + 100))} for a template field limit. */
    public static int hard(int max) {
        long hard = Math.max((long) OVERFLOW_FACTOR * max, (long) max + MIN_OVERFLOW);
        return (int) Math.min(ABSOLUTE_MAX, hard);
    }
}
