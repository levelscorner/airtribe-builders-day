-- Allow per-scene voiceover artefacts. Fresh installs already include `voice` in 001.
ALTER TABLE artefacts DROP CONSTRAINT IF EXISTS artefacts_kind_check;
ALTER TABLE artefacts ADD CONSTRAINT artefacts_kind_check CHECK (kind IN (
  'identity', 'sheet', 'anchor', 'voice_sample',
  'script', 'prompt', 'image', 'clip', 'audio', 'voice', 'final'
));
