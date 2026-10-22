CREATE TABLE generated_presentations (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    template_id VARCHAR(64) NOT NULL,
    topic TEXT NOT NULL,
    status VARCHAR(24) NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
    error_code VARCHAR(80),
    slide_count INTEGER,
    output_path TEXT,
    idempotency_key VARCHAR(100),
    request_hash VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    UNIQUE(user_id, idempotency_key)
);

CREATE INDEX generated_presentations_queue_idx
    ON generated_presentations(status, created_at);
CREATE INDEX generated_presentations_user_idx
    ON generated_presentations(user_id, created_at DESC);
