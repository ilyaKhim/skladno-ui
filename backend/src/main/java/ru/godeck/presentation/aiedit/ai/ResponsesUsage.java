package ru.godeck.presentation.aiedit.ai;

import tools.jackson.databind.JsonNode;

/**
 * Token usage reported by the Responses API for one call. Every value may be {@code null} when the
 * provider omits it.
 */
public record ResponsesUsage(
        Integer inputTokens, Integer cachedInputTokens, Integer outputTokens, Integer reasoningTokens) {
    public static final ResponsesUsage NONE = new ResponsesUsage(null, null, null, null);

    /**
     * Reads {@code usage.input_tokens}, {@code usage.input_tokens_details.cached_tokens}, {@code
     * usage.output_tokens} and {@code usage.output_tokens_details.reasoning_tokens} from a response
     * envelope. Missing or non-integer values become {@code null}.
     */
    public static ResponsesUsage from(JsonNode response) {
        if (response == null) return NONE;
        JsonNode usage = response.path("usage");
        return new ResponsesUsage(
                integer(usage.path("input_tokens")),
                integer(usage.path("input_tokens_details").path("cached_tokens")),
                integer(usage.path("output_tokens")),
                integer(usage.path("output_tokens_details").path("reasoning_tokens")));
    }

    private static Integer integer(JsonNode value) {
        return value.isIntegralNumber() && value.canConvertToInt() ? value.asInt() : null;
    }
}
