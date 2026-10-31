package ru.godeck.auth.policy;

/** Fixed credential and API-format constraints, independent of deployment deadlines and quotas. */
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

    private AuthPolicy() {}
}
