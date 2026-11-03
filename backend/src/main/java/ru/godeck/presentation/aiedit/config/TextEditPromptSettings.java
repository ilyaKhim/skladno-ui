package ru.godeck.presentation.aiedit.config;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.validation.annotation.Validated;

import java.util.Map;

/** Cost and context budgets of text proposals, independent of HTTP and quota settings. */
@Validated
@ConfigurationProperties("godeck.ai-edit.prompt")
public record TextEditPromptSettings(
        @DefaultValue("4096") @Min(1) int maxOutputTokens,
        @DefaultValue("1024") @Min(0) int baseOutputTokens,
        @DefaultValue("0.7") @DecimalMin(value = "0", inclusive = false)
                @DecimalMax(value = "1", inclusive = false) double shortenRatio,
        @DefaultValue("80") @Min(1) int titleMaxChars,
        @DefaultValue("160") @Min(1) int roleMaxChars,
        Map<String, @Pattern(regexp = "[a-z]{0,16}") String> reasoningEfforts) {

    public TextEditPromptSettings {
        reasoningEfforts = reasoningEfforts == null
                ? Map.of("gpt-5.4-mini", "low", "gpt-5.4", "low")
                : Map.copyOf(reasoningEfforts);
    }

    @AssertTrue(message = "max-output-tokens must exceed base-output-tokens")
    public boolean isOutputBudgetValid() {
        return maxOutputTokens > baseOutputTokens;
    }
}
