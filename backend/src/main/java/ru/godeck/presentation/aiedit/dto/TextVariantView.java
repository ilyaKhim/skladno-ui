package ru.godeck.presentation.aiedit.dto;

import tools.jackson.databind.PropertyNamingStrategies;
import tools.jackson.databind.annotation.JsonNaming;

import java.util.List;

/**
 * One proposed text, never truncated.
 *
 * @param length UTF-16 length of {@code text}
 * @param overBy {@code max(0, length - max_chars)}
 * @param warnings subset of {@code over_limit}, {@code exceeds_hard_limit}, {@code not_shorter},
 *     {@code line_breaks_removed}
 */
@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public record TextVariantView(String text, int length, int overBy, List<String> warnings) {}
