-- Journal of AI edits in the visual editor: idempotency, quota, outcome and replayable result.
CREATE TABLE presentation_ai_edits (
    id UUID PRIMARY KEY,
    presentation_id UUID NOT NULL REFERENCES generated_presentations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    kind VARCHAR(16) NOT NULL CHECK (kind IN ('TEXT_EDIT')),
    request_id UUID NOT NULL,
    request_hash VARCHAR(64) NOT NULL,
    refines_edit_id UUID REFERENCES presentation_ai_edits(id) ON DELETE SET NULL,
    action VARCHAR(32) NOT NULL,
    params_json TEXT NOT NULL,
    target_kind VARCHAR(16) NOT NULL,
    target_ref VARCHAR(200) NOT NULL,          -- "slide-3/STATEMENT" or "slide-3/<block_id>"
    source_length INTEGER NOT NULL,
    status VARCHAR(16) NOT NULL CHECK (status IN ('running','ok','unchanged','unsupported','failed')),
    result_json TEXT,                          -- 200 response body replayed for the same request_id
    model VARCHAR(100) NOT NULL,
    input_tokens INTEGER, cached_input_tokens INTEGER, output_tokens INTEGER, reasoning_tokens INTEGER,
    error_code VARCHAR(80),
    created_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    UNIQUE (user_id, request_id)
);
CREATE INDEX presentation_ai_edits_user_day_idx ON presentation_ai_edits(user_id, created_at);
CREATE INDEX presentation_ai_edits_presentation_idx ON presentation_ai_edits(presentation_id, created_at DESC);

ALTER TABLE presentation_ai_calls DROP CONSTRAINT presentation_ai_calls_operation_check;
ALTER TABLE presentation_ai_calls ADD CONSTRAINT presentation_ai_calls_operation_check
    CHECK (operation IN ('GENERATION', 'CHAT', 'TEXT_EDIT'));
ALTER TABLE presentation_ai_calls
    ADD COLUMN input_tokens INTEGER,
    ADD COLUMN cached_input_tokens INTEGER,
    ADD COLUMN output_tokens INTEGER,
    ADD COLUMN reasoning_tokens INTEGER;
CREATE INDEX presentation_ai_calls_retention_idx ON presentation_ai_calls(operation, started_at);
