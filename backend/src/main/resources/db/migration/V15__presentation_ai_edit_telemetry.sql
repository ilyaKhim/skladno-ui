-- Stage 1 of the AI chat: the alternative status, numeric telemetry, proposal outcomes and clearing.
-- No column here holds user text: only numbers, codes and enumerations.
ALTER TABLE presentation_ai_edits DROP CONSTRAINT presentation_ai_edits_status_check;
ALTER TABLE presentation_ai_edits ADD CONSTRAINT presentation_ai_edits_status_check
    CHECK (status IN ('running','ok','unchanged','unsupported','alternative','failed'));
ALTER TABLE presentation_ai_edits
    ADD COLUMN prompt_version VARCHAR(16),
    ADD COLUMN duration_ms BIGINT,
    ADD COLUMN max_output_tokens INTEGER,
    ADD COLUMN instruction_length INTEGER,
    ADD COLUMN alternative_reason VARCHAR(32),
    ADD COLUMN failure_reason VARCHAR(32),
    ADD COLUMN incomplete_reason VARCHAR(32),
    ADD COLUMN fact_guard VARCHAR(16),
    ADD COLUMN outcome VARCHAR(16) CHECK (outcome IN ('applied','rejected','reverted')),
    ADD COLUMN outcome_variant SMALLINT,
    ADD COLUMN outcome_at TIMESTAMPTZ,
    ADD COLUMN cleared_at TIMESTAMPTZ;
