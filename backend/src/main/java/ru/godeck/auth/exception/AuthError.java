package ru.godeck.auth.exception;

import org.springframework.http.HttpStatus;

public enum AuthError {
    INVALID_INPUT("invalid-input", HttpStatus.BAD_REQUEST),
    EMAIL_ALREADY_REGISTERED("invalid-input", HttpStatus.CONFLICT),
    INVALID_CREDENTIALS("invalid-credentials", HttpStatus.UNAUTHORIZED),
    RATE_LIMITED("rate-limited", HttpStatus.TOO_MANY_REQUESTS),
    TOO_MANY_ATTEMPTS("too-many-attempts", HttpStatus.TOO_MANY_REQUESTS),
    EXPIRED_CODE("expired-code", HttpStatus.BAD_REQUEST),
    INVALID_CODE("invalid-code", HttpStatus.BAD_REQUEST),
    SEND_FAILED("send-failed", HttpStatus.SERVICE_UNAVAILABLE);

    private final String code;
    private final HttpStatus status;

    AuthError(String code, HttpStatus status) {
        this.code = code;
        this.status = status;
    }

    public String code() {
        return code;
    }

    public HttpStatus status() {
        return status;
    }
}
