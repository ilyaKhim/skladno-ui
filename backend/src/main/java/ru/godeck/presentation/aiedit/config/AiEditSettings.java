package ru.godeck.presentation.aiedit.config;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import org.hibernate.validator.constraints.time.DurationMin;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.validation.annotation.Validated;

import java.time.Duration;

/** Operational settings of block-level AI edits; API and database limits remain fixed. */
@Validated
@ConfigurationProperties("godeck.ai-edit")
public record AiEditSettings(
        @DefaultValue("100") @Min(1) int maxEditsPerWindow,
        @DefaultValue("24h") @NotNull @DurationMin(seconds = 1) Duration quotaWindow,
        @DefaultValue("10s") @NotNull @DurationMin(millis = 1) Duration connectTimeout,
        @DefaultValue("30s") @NotNull @DurationMin(millis = 1) Duration readTimeout,
        @DefaultValue("2m") @NotNull @DurationMin(seconds = 1) Duration staleAfter,
        @DefaultValue("90d") @NotNull @DurationMin(seconds = 1) Duration retention,
        @DefaultValue("1000") @Min(1) int retentionBatchSize) {

    /** A retry must not mark a provider call abandoned while its HTTP timeout is still running. */
    @AssertTrue(message = "stale-after must exceed connect-timeout + read-timeout")
    public boolean isStaleAfterTimeouts() {
        return connectTimeout != null
                && readTimeout != null
                && staleAfter != null
                && staleAfter.compareTo(connectTimeout.plus(readTimeout)) > 0;
    }
}
