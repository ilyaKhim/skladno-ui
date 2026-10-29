package ru.godeck.presentation.aiedit.dto;

import ru.godeck.presentation.aiedit.ai.ResponsesUsage;

import tools.jackson.databind.PropertyNamingStrategies;
import tools.jackson.databind.annotation.JsonNaming;

/** Token usage of the call; values are {@code null} when the provider did not report them. */
@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public record AiUsageView(
        Integer inputTokens, Integer cachedInputTokens, Integer outputTokens, Integer reasoningTokens) {
    public static AiUsageView from(ResponsesUsage usage) {
        return new AiUsageView(
                usage.inputTokens(),
                usage.cachedInputTokens(),
                usage.outputTokens(),
                usage.reasoningTokens());
    }
}
