package ru.godeck.documents;

import tools.jackson.databind.ObjectMapper;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.Properties;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/**
 * Single-job document worker. It has no HTTP endpoints, user/session code, or AI credentials.
 * PostgreSQL grants a short claim; only its token may store the result. A hard watchdog exits this
 * process if a parser hangs, so a supervisor can restart it without taking down the API.
 */
public final class DocumentWorker {
    private static final ObjectMapper JSON = new ObjectMapper();

    private DocumentWorker() {}

    public static void main(String[] args) throws Exception {
        var credentials = new Properties();
        credentials.setProperty("user", env("DATABASE_USER", "godeck"));
        credentials.setProperty("password", env("DATABASE_PASSWORD", "godeck-local-only"));
        credentials.setProperty("connectTimeout", "5");
        credentials.setProperty("socketTimeout", "5");
        var watchdog =
                Executors.newSingleThreadScheduledExecutor(
                        runnable -> {
                            var thread = new Thread(runnable, "parser-deadline");
                            thread.setDaemon(true);
                            return thread;
                        });
        System.out.println("Document worker ready");
        while (!Thread.currentThread().isInterrupted()) {
            try (var connection =
                    DriverManager.getConnection(
                            env("DATABASE_URL", "jdbc:postgresql://127.0.0.1:5433/godeck"),
                            credentials)) {
                var job = claim(connection);
                if (job == null) {
                    Thread.sleep(500);
                    continue;
                }
                // Interrupting a Future cannot reliably stop a document library. Exit the isolated
                // worker instead; expired claims cannot accept a late result.
                var deadline =
                        watchdog.schedule(() -> Runtime.getRuntime().halt(2), 5, TimeUnit.SECONDS);
                try {
                    Object result = MaterialParser.extract(job.payload(), job.format(), job.name());
                    finish(connection, job, JSON.writeValueAsString(result), null);
                } catch (MaterialParser.InvalidMaterial invalid) {
                    finish(connection, job, null, invalid.code());
                } catch (Exception invalid) {
                    finish(connection, job, null, "source_invalid");
                } finally {
                    deadline.cancel(false);
                }
            } catch (SQLException failure) {
                System.err.println(
                        "Document queue unavailable (SQL state " + failure.getSQLState() + ")");
                Thread.sleep(1000);
            }
        }
        watchdog.shutdownNow();
    }

    /** One SQL statement claims work atomically even with multiple worker processes. */
    private static Job claim(Connection connection) throws SQLException {
        UUID token = UUID.randomUUID();
        try (var statement =
                connection.prepareStatement(
                        """
                        WITH next AS (SELECT id FROM material_jobs
                            WHERE status='queued' AND deadline>now() AND expires_at>now()
                            ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1)
                        UPDATE material_jobs j SET status='running',claim_id=?,deadline=now()+interval '10 seconds'
                        FROM next WHERE j.id=next.id RETURNING j.id,j.name,j.format,j.payload
                        """)) {
            statement.setObject(1, token);
            try (var rows = statement.executeQuery()) {
                return rows.next()
                        ? new Job(
                                rows.getObject("id", UUID.class),
                                token,
                                rows.getString("name"),
                                rows.getString("format"),
                                rows.getBytes("payload"))
                        : null;
            }
        }
    }

    /** Store the bounded result and erase the original bytes in the same atomic update. */
    private static void finish(Connection connection, Job job, String result, String error)
            throws SQLException {
        try (var statement =
                connection.prepareStatement(
                        """
                        UPDATE material_jobs SET status=?,result_json=?,error_code=?,payload=NULL,claim_id=NULL
                        WHERE id=? AND claim_id=? AND status='running' AND deadline>now() AND expires_at>now()
                        """)) {
            statement.setString(1, error == null ? "succeeded" : "failed");
            statement.setString(2, result);
            statement.setString(3, error);
            statement.setObject(4, job.id());
            statement.setObject(5, job.token());
            statement.executeUpdate();
        }
    }

    private static String env(String key, String fallback) {
        String value = System.getenv(key);
        return value == null || value.isBlank() ? fallback : value;
    }

    private record Job(UUID id, UUID token, String name, String format, byte[] payload) {}
}
