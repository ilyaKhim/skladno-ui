package ru.godeck.presentation.repository.converter;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

import ru.godeck.presentation.model.GenerationMode;

import java.util.Locale;

@Converter(autoApply = true)
public class GenerationModeConverter implements AttributeConverter<GenerationMode, String> {
    public String convertToDatabaseColumn(GenerationMode value) {
        return value == null ? null : value.value();
    }

    public GenerationMode convertToEntityAttribute(String value) {
        return value == null ? null : GenerationMode.valueOf(value.toUpperCase(Locale.ROOT));
    }
}
