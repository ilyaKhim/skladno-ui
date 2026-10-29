package ru.godeck.presentation.aiedit.policy;

import ru.godeck.presentation.template.EditorTextLimits;

import java.time.Duration;
import java.util.Map;

/** Limits, quotas and timeouts of AI edits in the visual editor. */
public final class AiEditPolicy {
    /** Rolling-window quota per user; independent of the studio chat quota. */
    public static final int MAX_TEXT_EDITS_PER_DAY = 100;

    public static final Duration QUOTA_WINDOW = Duration.ofHours(24);
    public static final int MAX_VARIANTS = 3;
    public static final int DEFAULT_VARIANTS = 1;

    /** Source text accepted for a user-created text block. */
    public static final int CUSTOM_BLOCK_MAX_INPUT_CHARS = 2_000;

    /** Soft and hard limit of a user-created text block (the editor's absolute ceiling). */
    public static final int CUSTOM_BLOCK_MAX_CHARS = EditorTextLimits.ABSOLUTE_MAX;

    public static final int MAX_INSTRUCTION_LENGTH = 300;

    /** Context passed to the model is shortened; the result never is. */
    public static final int CONTEXT_TITLE_MAX = 80;

    public static final int ROLE_MAX = 160;

    /** A {@code running} edit older than this is considered abandoned. */
    public static final Duration STALE_AFTER = Duration.ofMinutes(2);

    public static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(10);
    public static final Duration READ_TIMEOUT = Duration.ofSeconds(30);

    /** Edit journal rows and {@code TEXT_EDIT} provider exchanges are kept this long. */
    public static final Duration RETENTION = Duration.ofDays(90);

    public static final int RETENTION_BATCH_SIZE = 1_000;

    /** Shorten aims at this fraction of the source length. */
    public static final double SHORTEN_RATIO = 0.7;

    /** Output budget: {@code min(MAX, BASE + variants × ceil(max_chars / 2))}. */
    public static final int MAX_OUTPUT_TOKENS = 2_048;

    public static final int BASE_OUTPUT_TOKENS = 256;

    /**
     * Reasoning effort sent per model. A model absent from this map receives no {@code reasoning}
     * parameter, so models that do not support it are never sent one.
     */
    public static final Map<String, String> REASONING_EFFORT_BY_MODEL =
            Map.of("gpt-5.4-mini", "low", "gpt-5.4", "low");

    public static final int ACTION_ID_MAX_LENGTH = 32;
    public static final String ACTION_ID_PATTERN = "[a-z][a-z0-9_]{0," + (ACTION_ID_MAX_LENGTH - 1) + "}";
    public static final int KIND_MAX_LENGTH = 16;
    public static final int STATUS_MAX_LENGTH = 16;
    public static final int TARGET_REF_MAX_LENGTH = 200;
    public static final int SLIDE_ID_MAX_LENGTH = 16;
    public static final int FIELD_KEY_MAX_LENGTH = 120;
    public static final int BLOCK_ID_MAX_LENGTH = 120;
    public static final int MAX_PARAMS = 10;
    public static final int MAX_TASK_LENGTH = 300;

    private AiEditPolicy() {}
}
