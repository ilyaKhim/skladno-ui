package ru.godeck.presentation.dto;

import tools.jackson.databind.PropertyNamingStrategies;
import tools.jackson.databind.annotation.JsonNaming;

import java.util.List;

/** Only order, inclusion, and the server-selected primary title are writable at review time. */
public record SavePresentationOutlineRequest(long revision, List<Slide> slides) {
    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record Slide(int sourceSlideNumber, Boolean include, String title) {}
}
