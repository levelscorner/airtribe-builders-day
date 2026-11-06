-- Last authenticated request. Additive: databases that already have the column are unchanged.
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at timestamptz;
