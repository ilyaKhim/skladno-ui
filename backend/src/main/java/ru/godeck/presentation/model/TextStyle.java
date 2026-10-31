package ru.godeck.presentation.model;

import tools.jackson.databind.PropertyNamingStrategies;
import tools.jackson.databind.annotation.JsonNaming;

import java.util.Set;

/**
 * Optional text-box overrides. Null properties retain source-template or legacy custom-block
 * formatting; an empty object restores those defaults without inventing a replacement font.
 */
@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public record TextStyle(
        String fontFamily,
        Integer fontSize,
        Integer weight,
        String align,
        String color,
        Boolean italic,
        Boolean underline) {
    private static final Set<String> FONTS =
            Set.of("Arial", "Inter", "Manrope", "Georgia", "Times New Roman", "Courier New");

    /** Rejects unsupported formatting before it reaches stored drafts or the PowerPoint renderer. */
    public void validate() {
        if ((fontFamily != null && !FONTS.contains(fontFamily))
                || (fontSize != null && (fontSize < 8 || fontSize > 96))
                || (weight != null && !Set.of(400, 500, 700).contains(weight))
                || (align != null && !Set.of("left", "center", "right").contains(align))
                || (color != null && !color.matches("#[0-9a-fA-F]{6}"))) {
            throw new IllegalArgumentException("Unsupported text formatting");
        }
    }
}
