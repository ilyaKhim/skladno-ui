package ru.godeck.auth.config;

import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import org.hibernate.validator.constraints.time.DurationMax;
import org.hibernate.validator.constraints.time.DurationMin;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.validation.annotation.Validated;

import java.time.Duration;

/** Authentication deadlines and admission limits; credential formats remain fixed API rules. */
@Validated
@ConfigurationProperties("godeck.auth")
public record AuthSettings(
        @DefaultValue("10m") @NotNull @DurationMin(minutes = 1)
                @DurationMax(seconds = Integer.MAX_VALUE) Duration codeTtl,
        @DefaultValue("30m") @NotNull @DurationMin(minutes = 1)
                @DurationMax(seconds = Integer.MAX_VALUE) Duration resetTtl,
        @DefaultValue("15m") @NotNull @DurationMin(seconds = 1)
                @DurationMax(seconds = Integer.MAX_VALUE) Duration loginLock,
        @DefaultValue("60s") @NotNull @DurationMin(seconds = 1)
                @DurationMax(seconds = Integer.MAX_VALUE) Duration resendCooldown,
        @DefaultValue("5") @Min(1) @Max(Integer.MAX_VALUE - 1) int maxFailedAttempts,
        @DefaultValue @NotNull @Valid IpProtection ip) {

    /** Mail templates state minutes, while the API and Retry-After state integer seconds. */
    @AssertTrue(message = "code/reset TTL must use whole minutes; resend cooldown must use whole seconds")
    public boolean isDeadlinePrecisionValid() {
        return wholeMinutes(codeTtl) && wholeMinutes(resetTtl)
                && resendCooldown != null && resendCooldown.getNano() == 0;
    }

    /** The same configured cooldown is returned by the controller and enforced by services. */
    public int resendAfterSeconds() {
        return Math.toIntExact(resendCooldown.toSeconds());
    }

    private static boolean wholeMinutes(Duration duration) {
        return duration != null && duration.getNano() == 0 && duration.toSeconds() % 60 == 0;
    }

    /** Coarse per-process protection, keyed by the directly connected address, never proxy headers. */
    public record IpProtection(
            @DefaultValue("10000") @Min(1) int maxTrackedAddresses,
            @DefaultValue("100") @Min(1) @Max(Integer.MAX_VALUE - 1) int maxRequestsPerWindow,
            @DefaultValue("15m") @NotNull @DurationMin(seconds = 1)
                    @DurationMax(seconds = Integer.MAX_VALUE) Duration requestWindow) {}
}
