package ru.godeck.presentation.material;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import org.hibernate.validator.constraints.time.DurationMin;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.validation.annotation.Validated;

import java.time.Duration;

/** Queue admission and result lifetime; file/text ceilings belong to the shared upload contract. */
@Validated
@ConfigurationProperties("godeck.materials.jobs")
public record MaterialJobSettings(
        @DefaultValue("20") @Min(1) int maxActive,
        @DefaultValue("2") @Min(1) int maxActivePerUser,
        @DefaultValue("60s") @NotNull @DurationMin(millis = 1) Duration queueTimeout,
        @DefaultValue("1h") @NotNull @DurationMin(millis = 1) Duration resultTtl) {

    @AssertTrue(message = "result-ttl must exceed queue-timeout")
    public boolean isResultTtlAfterQueue() {
        return resultTtl != null && queueTimeout != null && resultTtl.compareTo(queueTimeout) > 0;
    }
}
