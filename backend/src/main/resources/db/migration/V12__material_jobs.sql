CREATE TABLE material_jobs (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    format VARCHAR(4) NOT NULL CHECK (format IN ('pdf','docx','txt')),
    status VARCHAR(12) NOT NULL CHECK (status IN ('queued','running','succeeded','failed')),
    payload BYTEA,
    result_json TEXT,
    error_code VARCHAR(80),
    claim_id UUID,
    deadline TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '1 hour',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (payload IS NULL OR octet_length(payload) <= 5242880),
    CHECK (result_json IS NULL OR octet_length(result_json) <= 200000)
);
CREATE INDEX material_jobs_queue ON material_jobs(created_at) WHERE status='queued';
CREATE INDEX material_jobs_owner ON material_jobs(user_id, created_at DESC);
