package ru.godeck.presentation.aiedit.action;

import com.fasterxml.jackson.annotation.JsonValue;

import java.util.List;
import java.util.Locale;
import java.util.Objects;

/**
 * Parameter of an action, used both for the public catalog and for request validation.
 *
 * @param maxLength longest accepted value of a {@code STRING} parameter; {@code null} for enums
 * @param options allowed values of an {@code ENUM} parameter; empty for strings
 */
public record ActionParam(
        String name, Type type, boolean required, Integer maxLength, List<Option> options) {
    public ActionParam {
        Objects.requireNonNull(name);
        Objects.requireNonNull(type);
        options = options == null ? List.of() : List.copyOf(options);
        if (type == Type.STRING && (maxLength == null || maxLength < 1 || !options.isEmpty()))
            throw new IllegalArgumentException(name);
        if (type == Type.ENUM && (maxLength != null || options.isEmpty()))
            throw new IllegalArgumentException(name);
    }

    public static ActionParam string(String name, boolean required, int maxLength) {
        return new ActionParam(name, Type.STRING, required, maxLength, List.of());
    }

    public static ActionParam choice(String name, boolean required, List<Option> options) {
        return new ActionParam(name, Type.ENUM, required, null, options);
    }

    public enum Type {
        ENUM,
        STRING;

        @JsonValue
        public String value() {
            return name().toLowerCase(Locale.ROOT);
        }
    }

    /** Allowed enum value; the label is a {@code messages.properties} key. */
    public record Option(String id, String labelKey) {}
}
