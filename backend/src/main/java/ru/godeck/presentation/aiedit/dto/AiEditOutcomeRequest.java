package ru.godeck.presentation.aiedit.dto;

import jakarta.validation.constraints.NotNull;

/**
 * Body of {@code POST .../editor/ai/edits/{editId}/outcome}.
 *
 * @param outcome {@code applied}, {@code rejected} or {@code reverted}
 * @param variant index of the applied variant; {@code null} for other outcomes
 */
public record AiEditOutcomeRequest(@NotNull String outcome, Integer variant) {}
