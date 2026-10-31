package ru.godeck.documents;

import java.util.Map;

/** Operational limits of the isolated worker; document format limits stay in the shared contract. */
record WorkerSettings(
        int pollMillis,
        int retryMillis,
        int connectTimeoutSeconds,
        int socketTimeoutSeconds,
        int jobTimeoutSeconds,
        int claimLeaseSeconds) {
    WorkerSettings {
        positive("DOCUMENT_WORKER_POLL_MS", pollMillis);
        positive("DOCUMENT_WORKER_RETRY_MS", retryMillis);
        positive("DOCUMENT_WORKER_CONNECT_TIMEOUT_SECONDS", connectTimeoutSeconds);
        positive("DOCUMENT_WORKER_SOCKET_TIMEOUT_SECONDS", socketTimeoutSeconds);
        positive("DOCUMENT_WORKER_JOB_TIMEOUT_SECONDS", jobTimeoutSeconds);
        positive("DOCUMENT_WORKER_CLAIM_LEASE_SECONDS", claimLeaseSeconds);
        jdbcTimeout("DOCUMENT_WORKER_CONNECT_TIMEOUT_SECONDS", connectTimeoutSeconds);
        jdbcTimeout("DOCUMENT_WORKER_SOCKET_TIMEOUT_SECONDS", socketTimeoutSeconds);
        // Reserve one socket timeout for the final update, not just the parser's running time.
        if ((long) claimLeaseSeconds < (long) jobTimeoutSeconds + socketTimeoutSeconds)
            throw new IllegalArgumentException(
                    "DOCUMENT_WORKER_CLAIM_LEASE_SECONDS must cover job timeout + socket timeout");
    }

    /** Reads once at startup so an invalid deployment fails before claiming any user document. */
    static WorkerSettings fromEnvironment(Map<String, String> environment) {
        return new WorkerSettings(
                integer(environment, "DOCUMENT_WORKER_POLL_MS", 500),
                integer(environment, "DOCUMENT_WORKER_RETRY_MS", 1_000),
                integer(environment, "DOCUMENT_WORKER_CONNECT_TIMEOUT_SECONDS", 5),
                integer(environment, "DOCUMENT_WORKER_SOCKET_TIMEOUT_SECONDS", 5),
                integer(environment, "DOCUMENT_WORKER_JOB_TIMEOUT_SECONDS", 5),
                integer(environment, "DOCUMENT_WORKER_CLAIM_LEASE_SECONDS", 10));
    }

    private static int integer(Map<String, String> environment, String name, int fallback) {
        String value = environment.get(name);
        if (value == null) return fallback;
        try {
            return Integer.parseInt(value.strip());
        } catch (NumberFormatException invalid) {
            throw new IllegalArgumentException(name + " must be a positive integer", invalid);
        }
    }

    private static void positive(String name, int value) {
        if (value < 1) throw new IllegalArgumentException(name + " must be positive");
    }

    private static void jdbcTimeout(String name, int seconds) {
        // The PostgreSQL driver converts seconds to milliseconds with int multiplication.
        if (seconds > Integer.MAX_VALUE / 1_000)
            throw new IllegalArgumentException(name + " exceeds the JDBC millisecond range");
    }
}
