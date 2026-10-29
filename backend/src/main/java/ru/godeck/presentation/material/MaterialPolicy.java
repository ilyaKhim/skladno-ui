package ru.godeck.presentation.material;

import java.time.Duration;

/** Shared server-side limits for extraction and the final, user-edited source snapshot. */
public final class MaterialPolicy {
    public static final int MAX_FILE_BYTES = 5 * 1024 * 1024;
    public static final int MAX_TEXT_CHARACTERS = 30_000;
    public static final int MAX_PDF_PAGES = 20;
    public static final int MAX_CONTEXT_CHARACTERS = 500;
    public static final int MAX_NAME_CHARACTERS = 255;
    public static final int MAX_ZIP_ENTRIES = 1_000;
    public static final long MAX_INFLATED_BYTES = 50L * 1024 * 1024;
    public static final Duration EXTRACTION_TIMEOUT = Duration.ofSeconds(5);
    public static final Duration RETENTION = Duration.ofDays(30);

    private MaterialPolicy() {}
}
