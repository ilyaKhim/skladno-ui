-- Keep network/PPTX work outside DB transactions while serializing edits across API instances.
ALTER TABLE generated_presentations ADD COLUMN edit_id UUID;
ALTER TABLE generated_presentations ADD COLUMN edit_started_at TIMESTAMPTZ;
ALTER TABLE generated_presentations ADD CONSTRAINT generated_presentations_edit_lease_check
    CHECK ((edit_id IS NULL) = (edit_started_at IS NULL));
