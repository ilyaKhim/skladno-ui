ALTER TABLE generated_presentations
    DROP CONSTRAINT generated_presentations_status_check;

ALTER TABLE generated_presentations
    ADD CONSTRAINT generated_presentations_status_check
        CHECK (status IN ('awaiting_content', 'queued', 'running', 'succeeded', 'failed', 'cancelled'));
