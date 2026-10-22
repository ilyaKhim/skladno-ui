package ru.godeck.common.security;

import java.time.Duration;

public final class SecurityPolicy {
    public static final String USER_AUTHORITY = "ROLE_USER";
    public static final int MAX_TRACKED_IP_ADDRESSES = 10_000;
    public static final int MAX_AUTH_REQUESTS_PER_WINDOW = 100;
    public static final Duration AUTH_REQUEST_WINDOW = Duration.ofMinutes(15);

    private SecurityPolicy() {}
}
