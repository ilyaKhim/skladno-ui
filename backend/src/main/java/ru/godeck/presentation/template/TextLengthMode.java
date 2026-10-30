package ru.godeck.presentation.template;

/**
 * Selects how template field text longer than its layout limit is handled.
 *
 * <p>{@link #TRUNCATE} is the historical behavior used by AI generation, manual assembly and the
 * studio chat: overlong values are shortened to {@code max_chars}. {@link #ALLOW_OVERFLOW} is used
 * only by visual-editor paths: text is kept intact up to {@link EditorTextLimits#hard(int)} and
 * rejected above it.
 */
public enum TextLengthMode {
    TRUNCATE,
    ALLOW_OVERFLOW
}
