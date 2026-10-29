package ru.godeck.presentation.dto;

import ru.godeck.presentation.model.PresentationStatus;

import tools.jackson.databind.PropertyNamingStrategies;
import tools.jackson.databind.annotation.JsonNaming;

import java.util.List;
import java.util.UUID;

/**
 * Private projection of the saved semantic document, not a second independently generated outline.
 */
@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public record PresentationOutlineView(
        UUID id, String templateId, PresentationStatus status, long revision, List<Slide> slides) {
    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record Slide(
            int sourceSlideNumber,
            boolean include,
            String title,
            String titleFieldKey,
            Integer titleMaxChars,
            String description,
            String summary) {}
}
