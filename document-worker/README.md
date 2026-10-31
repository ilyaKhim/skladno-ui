# Document worker configuration

The worker reads its environment once at startup. Defaults preserve the existing behavior.
Each value below must be a positive integer; invalid or empty values fail startup.
JDBC timeout values cannot exceed `2147483` seconds because the driver stores milliseconds in an int.

| Environment variable | Default | Purpose |
| --- | ---: | --- |
| `DOCUMENT_WORKER_POLL_MS` | `500` | Delay when no queued document is available |
| `DOCUMENT_WORKER_RETRY_MS` | `1000` | Delay after a database failure |
| `DOCUMENT_WORKER_CONNECT_TIMEOUT_SECONDS` | `5` | PostgreSQL connection timeout |
| `DOCUMENT_WORKER_SOCKET_TIMEOUT_SECONDS` | `5` | PostgreSQL socket read timeout |
| `DOCUMENT_WORKER_JOB_TIMEOUT_SECONDS` | `5` | Hard watchdog for extraction and storing its result |
| `DOCUMENT_WORKER_CLAIM_LEASE_SECONDS` | `10` | Time during which the claim token may finish its job |

The claim lease must be at least the job timeout plus one socket timeout. Increasing the watchdog
also requires increasing the lease. The watchdog covers the entire claimed job, including the final
database update; expiry stops the isolated process, not the API.

Existing `DATABASE_URL`, `DATABASE_USER` and `DATABASE_PASSWORD` variables are unchanged.
Parser limits (5 MiB input, 30,000 text characters, 20 PDF pages) remain fixed: they are part of the
API/frontend contract and database constraints, not independent worker deployment settings.
