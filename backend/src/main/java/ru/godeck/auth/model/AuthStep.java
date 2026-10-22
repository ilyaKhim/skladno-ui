package ru.godeck.auth.model;

import com.fasterxml.jackson.annotation.JsonValue;

public enum AuthStep {
    PASSWORD("password"),
    VERIFY("verify"),
    CREATE_PASSWORD("create-password");
    private final String value;

    AuthStep(String value) {
        this.value = value;
    }

    @JsonValue
    public String value() {
        return value;
    }
}
