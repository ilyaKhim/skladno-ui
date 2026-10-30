-- The normal editor now owns both review and publication. Preserve all published versions.
ALTER TABLE generated_presentations DROP CONSTRAINT generated_presentations_status_check;
UPDATE generated_presentations SET status='draft', current_version=0
    WHERE status IN ('awaiting_review','queued','running') AND content_json IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM presentation_revisions r WHERE r.presentation_id=generated_presentations.id);
UPDATE generated_presentations SET current_version=0
    WHERE status IN ('queued','running','awaiting_content','failed','cancelled')
      AND NOT EXISTS (SELECT 1 FROM presentation_revisions r WHERE r.presentation_id=generated_presentations.id);
ALTER TABLE generated_presentations
    ADD CONSTRAINT generated_presentations_status_check CHECK (
        status IN ('awaiting_content','queued','running','draft','succeeded','failed','cancelled'));
ALTER TABLE generated_presentations ALTER COLUMN current_version SET DEFAULT 0;
ALTER TABLE generated_presentations DROP CONSTRAINT presentation_outline_revision_check;
ALTER TABLE generated_presentations
    DROP COLUMN review_before_render,
    DROP COLUMN outline_revision,
    DROP COLUMN outline_confirmed_revision;
