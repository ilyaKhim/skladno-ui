package ru.godeck.documents;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.Test;

import java.util.Map;

class WorkerSettingsTest {
    @Test
    void defaultsPreserveExistingWorkerTiming() {
        assertThat(WorkerSettings.fromEnvironment(Map.of()))
                .isEqualTo(new WorkerSettings(500, 1_000, 5, 5, 5, 10));
    }

    @Test
    void environmentOverridesEveryOperationalSetting() {
        assertThat(
                        WorkerSettings.fromEnvironment(
                                Map.of(
                                        "DOCUMENT_WORKER_POLL_MS", "200",
                                        "DOCUMENT_WORKER_RETRY_MS", "2000",
                                        "DOCUMENT_WORKER_CONNECT_TIMEOUT_SECONDS", "3",
                                        "DOCUMENT_WORKER_SOCKET_TIMEOUT_SECONDS", "4",
                                        "DOCUMENT_WORKER_JOB_TIMEOUT_SECONDS", "8",
                                        "DOCUMENT_WORKER_CLAIM_LEASE_SECONDS", "15")))
                .isEqualTo(new WorkerSettings(200, 2_000, 3, 4, 8, 15));
    }

    @Test
    void rejectsInvalidNumbersInsteadOfSilentlyUsingDefaults() {
        for (String name :
                new String[] {
                    "DOCUMENT_WORKER_POLL_MS",
                    "DOCUMENT_WORKER_RETRY_MS",
                    "DOCUMENT_WORKER_CONNECT_TIMEOUT_SECONDS",
                    "DOCUMENT_WORKER_SOCKET_TIMEOUT_SECONDS",
                    "DOCUMENT_WORKER_JOB_TIMEOUT_SECONDS",
                    "DOCUMENT_WORKER_CLAIM_LEASE_SECONDS"
                }) {
            for (String value : new String[] {"", "abc", "-1", "0", "2147483648"}) {
                assertThatThrownBy(
                                () -> WorkerSettings.fromEnvironment(Map.of(name, value)))
                        .isInstanceOf(IllegalArgumentException.class)
                        .hasMessageContaining(name);
            }
        }
    }

    @Test
    void leaseReservesTimeForTheFinalDatabaseUpdate() {
        assertThatThrownBy(() -> new WorkerSettings(500, 1_000, 5, 5, 5, 9))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("must cover job timeout + socket timeout");
        assertThatThrownBy(
                        () ->
                                new WorkerSettings(
                                        500, 1_000, 5, Integer.MAX_VALUE, Integer.MAX_VALUE, 10))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void jdbcTimeoutsCannotOverflowTheDriversMillisecondConversion() {
        int maximum = Integer.MAX_VALUE / 1_000;
        assertThat(new WorkerSettings(500, 1_000, maximum, maximum, 5, maximum + 5))
                .extracting(WorkerSettings::socketTimeoutSeconds)
                .isEqualTo(maximum);
        assertThatThrownBy(() -> new WorkerSettings(500, 1_000, maximum + 1, 5, 5, 10))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("DOCUMENT_WORKER_CONNECT_TIMEOUT_SECONDS");
        assertThatThrownBy(
                        () -> new WorkerSettings(500, 1_000, 5, maximum + 1, 5, maximum + 6))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("DOCUMENT_WORKER_SOCKET_TIMEOUT_SECONDS");
    }
}
