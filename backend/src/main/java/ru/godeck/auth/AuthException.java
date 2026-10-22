package ru.godeck.auth;

import org.springframework.http.HttpStatus;

final class AuthException extends RuntimeException {
    final String code;
    final HttpStatus status;
    final Integer retryAfterSeconds;

    AuthException(String code, HttpStatus status) {
        this(code, status, null);
    }

    AuthException(String code, HttpStatus status, Integer retryAfterSeconds) {
        super(code);
        this.code = code;
        this.status = status;
        this.retryAfterSeconds = retryAfterSeconds;
    }
}
