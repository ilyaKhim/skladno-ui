package ru.godeck.presentation.generation;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import org.hibernate.validator.constraints.time.DurationMin;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

import java.time.Duration;

/** Generation quotas and deadlines, shared by admission checks, jobs and publication leases. */
@Validated
@ConfigurationProperties("godeck.generation")
public record GenerationSettings(
        @DefaultValue("10") @Min(1) int maxGenerationsPerWindow,
        @DefaultValue("3") @Min(1) int maxActivePresentations,
        @DefaultValue("30") @Min(1) int maxEditsPerWindow,
        @DefaultValue("24h") @NotNull @DurationMin(seconds = 1) Duration quotaWindow,
        @DefaultValue("10s") @NotNull @DurationMin(millis = 1) Duration connectTimeout,
        @DefaultValue("2m") @NotNull @DurationMin(millis = 1) Duration readTimeout,
        @DefaultValue("5m") @NotNull @DurationMin(seconds = 1) Duration jobTimeout,
        @DefaultValue("5m") @NotNull @DurationMin(seconds = 1) Duration editLeaseTimeout,
        @DefaultValue("30d") @NotNull @DurationMin(seconds = 1) Duration sourceRetention,
        @DefaultValue("12000") @Min(1) int maxOutputTokens) {

    /** Keep ownership of long-running work longer than a single provider HTTP exchange. */
    @AssertTrue(
            message = "job-timeout and edit-lease-timeout must exceed connect-timeout + read-timeout")
    public boolean isWorkTimeoutsAfterHttp() {
        if (connectTimeout == null
                || readTimeout == null
                || jobTimeout == null
                || editLeaseTimeout == null)
            return false;
        Duration httpTimeout = connectTimeout.plus(readTimeout);
        return jobTimeout.compareTo(httpTimeout) > 0 && editLeaseTimeout.compareTo(httpTimeout) > 0;
    }
}
