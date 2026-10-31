package ru.godeck.presentation.aiedit.policy;

import ru.godeck.presentation.template.EditorTextLimits;

/** Fixed API ceilings and text-generation rules; operational settings live in AiEditSettings. */
public final class AiEditPolicy {
    public static final int MAX_VARIANTS = 3;
    public static final int DEFAULT_VARIANTS = 1;

    /** Source text accepted for a user-created text block. */
    public static final int CUSTOM_BLOCK_MAX_INPUT_CHARS = 2_000;

    /** Soft and hard limit of a user-created text block (the editor's absolute ceiling). */
    public static final int CUSTOM_BLOCK_MAX_CHARS = EditorTextLimits.ABSOLUTE_MAX;

    public static final int MAX_INSTRUCTION_LENGTH = 300;

    public static final int ACTION_ID_MAX_LENGTH = 32;
    public static final int KIND_MAX_LENGTH = 16;
    public static final int STATUS_MAX_LENGTH = 16;
    public static final int TARGET_REF_MAX_LENGTH = 200;
    public static final int SLIDE_ID_MAX_LENGTH = 16;
    public static final int FIELD_KEY_MAX_LENGTH = 120;
    public static final int BLOCK_ID_MAX_LENGTH = 120;

    private AiEditPolicy() {}
}
