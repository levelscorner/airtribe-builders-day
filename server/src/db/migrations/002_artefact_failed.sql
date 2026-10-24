-- Widen artefacts.state for DBs that already applied 001 without `failed`.
-- Fresh MOCK installs get `failed` from 001; this is a no-op when the check already matches.

ALTER TABLE artefacts DROP CONSTRAINT IF EXISTS artefacts_state_check;
ALTER TABLE artefacts ADD CONSTRAINT artefacts_state_check CHECK (state IN (
  'pending', 'generating', 'awaiting_approval',
  'approved', 'rejected', 'failed'
));
