package ru.godeck.auth.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import java.time.Duration;

class AuthSettingsTest {
    private final ApplicationContextRunner context =
            new ApplicationContextRunner().withUserConfiguration(SettingsConfiguration.class);

    @Test
    void defaultsPreserveAuthenticationAndIpProtection() {
        context.run(app -> {
            assertThat(app).hasNotFailed();
            var settings = app.getBean(AuthSettings.class);
            assertThat(settings.codeTtl()).isEqualTo(Duration.ofMinutes(10));
            assertThat(settings.resetTtl()).isEqualTo(Duration.ofMinutes(30));
            assertThat(settings.loginLock()).isEqualTo(Duration.ofMinutes(15));
            assertThat(settings.resendAfterSeconds()).isEqualTo(60);
            assertThat(settings.maxFailedAttempts()).isEqualTo(5);
            assertThat(settings.ip().maxTrackedAddresses()).isEqualTo(10_000);
            assertThat(settings.ip().maxRequestsPerWindow()).isEqualTo(100);
            assertThat(settings.ip().requestWindow()).isEqualTo(Duration.ofMinutes(15));
        });
    }

    @Test
    void bindsOverridesIncludingNestedIpSettings() {
        context.withPropertyValues(
                "godeck.auth.code-ttl=3m",
                "godeck.auth.reset-ttl=7m",
                "godeck.auth.login-lock=30s",
                "godeck.auth.resend-cooldown=90s",
                "godeck.auth.max-failed-attempts=2",
                "godeck.auth.ip.max-tracked-addresses=1",
                "godeck.auth.ip.max-requests-per-window=2",
                "godeck.auth.ip.request-window=30s").run(app -> {
            assertThat(app).hasNotFailed();
            var settings = app.getBean(AuthSettings.class);
            assertThat(settings.codeTtl()).isEqualTo(Duration.ofMinutes(3));
            assertThat(settings.resetTtl()).isEqualTo(Duration.ofMinutes(7));
            assertThat(settings.loginLock()).isEqualTo(Duration.ofSeconds(30));
            assertThat(settings.resendAfterSeconds()).isEqualTo(90);
            assertThat(settings.maxFailedAttempts()).isEqualTo(2);
            assertThat(settings.ip().maxTrackedAddresses()).isEqualTo(1);
            assertThat(settings.ip().maxRequestsPerWindow()).isEqualTo(2);
            assertThat(settings.ip().requestWindow()).isEqualTo(Duration.ofSeconds(30));
        });
    }

    @ParameterizedTest
    @ValueSource(strings = {
        "godeck.auth.code-ttl=90s",
        "godeck.auth.reset-ttl=30s",
        "godeck.auth.login-lock=0s",
        "godeck.auth.resend-cooldown=1500ms",
        "godeck.auth.resend-cooldown=2147483648s",
        "godeck.auth.max-failed-attempts=0",
        "godeck.auth.ip.max-tracked-addresses=0",
        "godeck.auth.ip.max-requests-per-window=-1",
        "godeck.auth.ip.request-window=0s"
    })
    void invalidSettingsFailBeforeServingRequests(String property) {
        context.withPropertyValues(property).run(app -> assertThat(app).hasFailed());
    }

    @TestConfiguration(proxyBeanMethods = false)
    @EnableConfigurationProperties(AuthSettings.class)
    static class SettingsConfiguration {}
}
