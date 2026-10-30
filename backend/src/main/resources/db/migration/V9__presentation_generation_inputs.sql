-- Nullable for legacy jobs; snapshots are private inputs, not part of the public presentation DTO.
ALTER TABLE generated_presentations ADD COLUMN generation_input_json text;
