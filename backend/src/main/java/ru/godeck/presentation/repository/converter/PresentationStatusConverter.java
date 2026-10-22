package ru.godeck.presentation.repository.converter;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

import ru.godeck.presentation.model.PresentationStatus;

import java.util.Locale;

@Converter(autoApply = true)
public class PresentationStatusConverter implements AttributeConverter<PresentationStatus, String> {
    public String convertToDatabaseColumn(PresentationStatus value) {
        return value == null ? null : value.value();
    }

    public PresentationStatus convertToEntityAttribute(String value) {
        return value == null ? null : PresentationStatus.valueOf(value.toUpperCase(Locale.ROOT));
    }
}
