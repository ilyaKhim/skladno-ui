package ru.godeck.presentation.aiedit.repository.converter;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

import ru.godeck.presentation.aiedit.core.AiEditStatus;

import java.util.Locale;

/** Stores journal statuses in the lower-case form required by the V9 check constraint. */
@Converter
public class AiEditStatusConverter implements AttributeConverter<AiEditStatus, String> {
    public String convertToDatabaseColumn(AiEditStatus value) {
        return value == null ? null : value.value();
    }

    public AiEditStatus convertToEntityAttribute(String value) {
        return value == null ? null : AiEditStatus.valueOf(value.toUpperCase(Locale.ROOT));
    }
}
