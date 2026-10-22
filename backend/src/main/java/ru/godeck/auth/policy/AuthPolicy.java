package ru.godeck.auth.policy;

import java.time.Duration;

public final class AuthPolicy {
    public static final int EMAIL_MAX_LENGTH = 254;
    public static final int PASSWORD_MIN_LENGTH = 8;
    public static final int PASSWORD_MAX_BYTES = 72;
    public static final int PASSWORD_HASH_MAX_LENGTH = 100;
    public static final int VERIFICATION_CODE_LENGTH = 6;
    public static final int VERIFICATION_CODE_BOUND = 1_000_000;
    public static final String VERIFICATION_CODE_FORMAT = "%0" + VERIFICATION_CODE_LENGTH + "d";
    public static final String VERIFICATION_CODE_PATTERN =
            "[0-9]{" + VERIFICATION_CODE_LENGTH + "}";
    public static final int RESET_TOKEN_BYTES = 32;
    public static final int RESET_TOKEN_CHARACTERS = 43;
    public static final String RESET_TOKEN_PATTERN =
            "[A-Za-z0-9_-]{" + RESET_TOKEN_CHARACTERS + "}";
    public static final int CODE_VALIDITY_MINUTES = 10;
    public static final int RESET_VALIDITY_MINUTES = 30;
    public static final Duration CODE_TTL = Duration.ofMinutes(CODE_VALIDITY_MINUTES);
    public static final Duration RESET_TTL = Duration.ofMinutes(RESET_VALIDITY_MINUTES);
    public static final Duration LOGIN_LOCK = Duration.ofMinutes(15);
    public static final int RESEND_COOLDOWN_SECONDS = 60;
    public static final int MAX_FAILED_ATTEMPTS = 5;

    private AuthPolicy() {}
}
