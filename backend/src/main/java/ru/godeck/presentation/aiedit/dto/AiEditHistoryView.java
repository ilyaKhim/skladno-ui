package ru.godeck.presentation.aiedit.dto;

import tools.jackson.databind.PropertyNamingStrategies;
import tools.jackson.databind.annotation.JsonNaming;

import java.util.List;

/**
 * One page of the AI feed, newest records first.
 *
 * @param nextBefore opaque cursor of the next page, or {@code null} when there are no more records
 */
@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public record AiEditHistoryView(List<AiEditHistoryItemView> items, String nextBefore) {}
