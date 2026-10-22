package ru.godeck.auth.exception;

import org.springframework.http.HttpStatus;

public final class AuthException extends RuntimeException {
    private final AuthError error;
    private final Integer retryAfterSeconds;

    public AuthException(AuthError error) {
        this(error, null);
    }

    public AuthException(AuthError error, Integer retryAfterSeconds) {
        super(error.code());
        this.error = error;
        this.retryAfterSeconds = retryAfterSeconds;
    }

    public String code() {
        return error.code();
    }

    public HttpStatus status() {
        return error.status();
    }

    public Integer retryAfterSeconds() {
        return retryAfterSeconds;
    }
}
