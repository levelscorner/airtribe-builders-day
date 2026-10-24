-- Mars credit-ledger slice of docs/14 §3.
-- Saturn owns server/src/db/migrations (S2). This file lives under
-- server/src/credits because that folder is Mars's. Statements use
-- IF NOT EXISTS so S2 can apply the same DDL later without failing.
-- Columns match the contract, including credit_ledger.ref UNIQUE.

CREATE TABLE IF NOT EXISTS users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name    text NOT NULL,
  phone_or_email  text UNIQUE,
  credit_balance  integer NOT NULL DEFAULT 0 CHECK (credit_balance >= 0),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chats (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id),
  video_id        uuid,
  title           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS videos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id),
  chat_id         uuid NOT NULL REFERENCES chats(id),
  genre           text NOT NULL CHECK (genre IN ('kids', 'ad', 'faceless')),
  language        text NOT NULL CHECK (language IN ('hi', 'hinglish', 'en')),
  aspect_ratio    text NOT NULL DEFAULT '9:16',
  resolution      text NOT NULL DEFAULT '1080p' CHECK (resolution IN ('720p', '1080p')),
  target_seconds  integer NOT NULL DEFAULT 45,
  art_style       text,
  brief           jsonb NOT NULL DEFAULT '{}',
  stage           text NOT NULL DEFAULT 'brief' CHECK (stage IN (
                    'brief', 'cast', 'script', 'prompts', 'images',
                    'clips', 'audio', 'final', 'done'
                  )),
  status          text NOT NULL DEFAULT 'active' CHECK (status IN (
                    'active', 'failed', 'cancelled', 'done'
                  )),
  output_url      text,
  reserved_credits integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS credit_ledger (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id),
  ref             text NOT NULL UNIQUE,
  delta           integer NOT NULL,
  reason          text NOT NULL CHECK (reason IN (
                    'signup_grant', 'pack_purchase', 'reserve', 'settle',
                    'refund', 'regenerate', 'cast_create'
                  )),
  video_id        uuid REFERENCES videos(id),
  meta            jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now()
);
