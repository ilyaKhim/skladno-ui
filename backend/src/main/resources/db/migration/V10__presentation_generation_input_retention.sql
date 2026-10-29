-- The deadline is set once on the first terminal transition, independent of later editor activity.
ALTER TABLE generated_presentations ADD COLUMN generation_input_expires_at timestamptz;
