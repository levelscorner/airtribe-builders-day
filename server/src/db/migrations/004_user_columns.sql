-- Signup stores a display name, a phone or email, and the time the row was created.
-- Existing databases may have been created before these columns. Add only what is missing.
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_or_email text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS users_phone_or_email_key ON users (phone_or_email);
