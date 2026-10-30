package ru.godeck.presentation.aiedit.dto;

import tools.jackson.databind.PropertyNamingStrategies;
import tools.jackson.databind.annotation.JsonNaming;

import java.time.Instant;

/**
 * Quota state after the edit.
 *
 * @param resetsAt when the oldest edit in the rolling window stops counting
 */
@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public record AiQuotaView(int limit, int remaining, Instant resetsAt) {}
