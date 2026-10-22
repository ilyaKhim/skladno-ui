CREATE TABLE presentation_ai_calls (
    id UUID PRIMARY KEY,
    presentation_id UUID NOT NULL REFERENCES generated_presentations(id) ON DELETE CASCADE,
    operation VARCHAR(16) NOT NULL CHECK (operation IN ('GENERATION', 'CHAT')),
    model VARCHAR(100) NOT NULL,
    request_body TEXT NOT NULL,
    response_body TEXT,
    http_status INTEGER,
    error_code VARCHAR(80),
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    duration_ms BIGINT
);
CREATE INDEX presentation_ai_calls_history_idx
    ON presentation_ai_calls(presentation_id, started_at DESC);
