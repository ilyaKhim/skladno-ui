package ru.godeck.presentation.aiedit.action;

import com.fasterxml.jackson.annotation.JsonValue;

import java.util.Locale;

/**
 * How the chat panel offers an action: {@code QUICK} is a button; {@code INPUT} is sent by the free
 * text field and receives the message in its single string parameter.
 */
public enum ActionUi {
    QUICK,
    INPUT;

    @JsonValue
    public String value() {
        return name().toLowerCase(Locale.ROOT);
    }
}
