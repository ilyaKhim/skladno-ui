ALTER TABLE generated_presentations
    ADD COLUMN editor_json TEXT,
    ADD COLUMN editor_base_version INTEGER,
    ADD COLUMN editor_revision BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN editor_updated_at TIMESTAMPTZ;

ALTER TABLE generated_presentations ADD CONSTRAINT generated_presentations_editor_draft_check
    CHECK (
        (editor_json IS NULL AND editor_base_version IS NULL AND editor_updated_at IS NULL)
        OR
        (editor_json IS NOT NULL AND editor_base_version IS NOT NULL AND editor_revision >= 0 AND editor_updated_at IS NOT NULL)
    );
