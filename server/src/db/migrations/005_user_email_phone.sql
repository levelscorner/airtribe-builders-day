-- Email is required for new signups. Phone stays optional.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone text;

UPDATE users
SET email = phone_or_email
WHERE email IS NULL
  AND phone_or_email LIKE '%_@_%._%';
