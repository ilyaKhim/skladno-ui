ALTER TABLE generated_presentations
    ADD COLUMN mode VARCHAR(16) NOT NULL DEFAULT 'openai' CHECK (mode IN ('openai', 'manual')),
    ADD COLUMN content_json TEXT,
    ADD COLUMN current_version INTEGER NOT NULL DEFAULT 1;

CREATE TABLE presentation_revisions (
    id UUID PRIMARY KEY,
    presentation_id UUID NOT NULL REFERENCES generated_presentations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    version INTEGER NOT NULL,
    message TEXT NOT NULL,
    reply TEXT NOT NULL DEFAULT '',
    content_json TEXT NOT NULL,
    output_path TEXT NOT NULL,
    slide_count INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(presentation_id, version)
);
