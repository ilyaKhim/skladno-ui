package ru.godeck.presentation.policy;

import java.time.Duration;

public final class PresentationPolicy {
    public static final int MAX_TOPIC_LENGTH = 12_000;
    public static final int MAX_EDIT_MESSAGE_LENGTH = 4_000;
    public static final int MAX_GENERATIONS_PER_DAY = 10;
    public static final int MAX_ACTIVE_PRESENTATIONS = 3;
    public static final int MAX_EDITS_PER_DAY = 30;
    public static final Duration QUOTA_WINDOW = Duration.ofDays(1);
    public static final Duration GENERATION_TIMEOUT = Duration.ofMinutes(5);
    public static final Duration EDIT_LEASE_TIMEOUT = Duration.ofMinutes(5);
    public static final int INITIAL_VERSION = 1;
    public static final int DEFAULT_PAGE_SIZE = 20;
    public static final int MAX_PAGE_SIZE = 100;
    public static final int MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;
    public static final int MAX_IMAGE_DIMENSION = 8_192;
    public static final long MAX_IMAGE_PIXELS = 32_000_000L;
    public static final int MAX_IMAGES_PER_PRESENTATION = 100;
    public static final long MAX_IMAGE_STORAGE_BYTES = 100L * 1024 * 1024;
    public static final int TEMPLATE_ID_MAX_LENGTH = 64;
    public static final int MODEL_ID_MAX_LENGTH = 100;
    public static final int STATUS_MAX_LENGTH = 24;
    public static final int MODE_MAX_LENGTH = 16;
    public static final int ERROR_CODE_MAX_LENGTH = 80;
    public static final int IDEMPOTENCY_KEY_MIN_LENGTH = 8;
    public static final int IDEMPOTENCY_KEY_MAX_LENGTH = 100;
    public static final String IDEMPOTENCY_KEY_PATTERN =
            "[A-Za-z0-9_-]{" + IDEMPOTENCY_KEY_MIN_LENGTH + "," + IDEMPOTENCY_KEY_MAX_LENGTH + "}";
    public static final String MODEL_ID_PATTERN =
            "[A-Za-z0-9][A-Za-z0-9_.:-]{0," + (MODEL_ID_MAX_LENGTH - 1) + "}";

    private PresentationPolicy() {}
}
