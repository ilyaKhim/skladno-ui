package ru.godeck.presentation.aiedit.repository.converter;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

import ru.godeck.presentation.aiedit.core.TargetKind;

import java.util.Locale;

/** Stores target kinds with the same lower-case values as the public API. */
@Converter
public class TargetKindConverter implements AttributeConverter<TargetKind, String> {
    public String convertToDatabaseColumn(TargetKind value) {
        return value == null ? null : value.value();
    }

    public TargetKind convertToEntityAttribute(String value) {
        return value == null ? null : TargetKind.valueOf(value.toUpperCase(Locale.ROOT));
    }
}
