package ru.godeck.presentation.aiedit.policy;

import ru.godeck.presentation.editor.EditorTextLimits;

/** Fixed API ceilings and text-generation rules; operational settings live in AiEditSettings. */
public final class AiEditPolicy {
    public static final int MAX_VARIANTS = 3;
    public static final int DEFAULT_VARIANTS = 1;

    /** Source text accepted for a user-created text block. */
    public static final int CUSTOM_BLOCK_MAX_INPUT_CHARS = 2_000;

    /** Soft and hard limit of a user-created text block (the editor's absolute ceiling). */
    public static final int CUSTOM_BLOCK_MAX_CHARS = EditorTextLimits.ABSOLUTE_MAX;

    public static final int MAX_INSTRUCTION_LENGTH = 300;

    public static final int MAX_SUGGESTIONS = 3;
    public static final int MAX_SUGGESTION_LENGTH = 80;

    public static final int HISTORY_DEFAULT_LIMIT = 50;
    public static final int HISTORY_MAX_LIMIT = 100;

    public static final int ACTION_ID_MAX_LENGTH = 32;
    public static final int KIND_MAX_LENGTH = 16;
    public static final int STATUS_MAX_LENGTH = 16;
    public static final int TARGET_REF_MAX_LENGTH = 200;
    public static final int PROMPT_VERSION_MAX_LENGTH = 16;
    public static final int REASON_MAX_LENGTH = 32;

    private AiEditPolicy() {}
}
