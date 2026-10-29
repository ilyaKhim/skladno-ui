ALTER TABLE generated_presentations
    ADD COLUMN review_before_render boolean NOT NULL DEFAULT false,
    ADD COLUMN outline_revision bigint NOT NULL DEFAULT 0,
    ADD COLUMN outline_confirmed_revision bigint;

ALTER TABLE generated_presentations DROP CONSTRAINT generated_presentations_status_check;
ALTER TABLE generated_presentations
    ADD CONSTRAINT generated_presentations_status_check CHECK (
        status IN ('awaiting_content', 'queued', 'running', 'awaiting_review', 'succeeded', 'failed', 'cancelled')
    );

ALTER TABLE generated_presentations
    ADD CONSTRAINT presentation_outline_revision_check CHECK (
        outline_revision >= 0 AND
        (outline_confirmed_revision IS NULL OR
            (review_before_render AND outline_confirmed_revision = outline_revision AND outline_revision > 0))
    );
