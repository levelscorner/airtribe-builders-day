-- Saturn schema (docs/14 §3).
-- cast_members.id is text so Venus preset ids (preset_chintu, …) attach cleanly.

CREATE TABLE IF NOT EXISTS schema_migrations (
  id text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

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

CREATE TABLE IF NOT EXISTS messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id         uuid NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  role            text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  kind            text NOT NULL CHECK (kind IN (
                    'text', 'question', 'approval', 'progress', 'video'
                  )),
  body            jsonb NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_chat_created ON messages(chat_id, created_at);

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

CREATE TABLE IF NOT EXISTS scenes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id        uuid NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  idx             integer NOT NULL,
  title           text,
  narration       text,
  duration_ms     integer,
  doubts          jsonb NOT NULL DEFAULT '[]',
  UNIQUE (video_id, idx)
);

CREATE TABLE IF NOT EXISTS artefacts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id        uuid NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  scene_id        uuid REFERENCES scenes(id) ON DELETE CASCADE,
  kind            text NOT NULL CHECK (kind IN (
                    'identity', 'sheet', 'anchor', 'voice_sample',
                    'script', 'prompt', 'image', 'clip', 'audio', 'voice', 'final'
                  )),
  state           text NOT NULL DEFAULT 'pending' CHECK (state IN (
                    'pending', 'generating', 'awaiting_approval',
                    'approved', 'rejected', 'failed'
                  )),
  payload         jsonb NOT NULL DEFAULT '{}',
  credit_cost     integer NOT NULL DEFAULT 0,
  version         integer NOT NULL DEFAULT 1,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS artefacts_video_kind ON artefacts(video_id, kind, state);

CREATE TABLE IF NOT EXISTS approvals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artefact_id     uuid NOT NULL REFERENCES artefacts(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id),
  action          text NOT NULL CHECK (action IN (
                    'approve', 'reject', 'regenerate', 'approve_all_remaining'
                  )),
  note            text,
  credit_charged  integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS voices (
  id              text PRIMARY KEY,
  elevenlabs_voice_id text NOT NULL,
  label           text NOT NULL,
  language_hint   text NOT NULL,
  stability       real NOT NULL DEFAULT 0.4,
  style           real NOT NULL DEFAULT 0.2,
  default_cast_name text,
  is_preset       boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS cast_members (
  id                      text PRIMARY KEY,
  owner_user_id           uuid REFERENCES users(id),
  name                    text NOT NULL,
  role                    text NOT NULL CHECK (role IN (
                            'mascot', 'presenter', 'hero', 'product', 'narrator'
                          )),
  identity_text           text NOT NULL,
  dna_chips               jsonb NOT NULL DEFAULT '[]',
  art_style               text,
  sheet_url               text,
  anchor_url              text,
  higgsfield_element_id   text,
  voice_id                text REFERENCES voices(id),
  version                 integer NOT NULL DEFAULT 1,
  status                  text NOT NULL DEFAULT 'draft' CHECK (status IN (
                            'draft', 'approved', 'archived'
                          )),
  is_preset               boolean NOT NULL DEFAULT false,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cast_assets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cast_id         text NOT NULL REFERENCES cast_members(id) ON DELETE CASCADE,
  kind            text NOT NULL CHECK (kind IN ('sheet', 'anchor', 'sample_audio')),
  url             text NOT NULL,
  approved        boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS video_cast (
  video_id        uuid NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  cast_id         text NOT NULL REFERENCES cast_members(id),
  cast_version    integer NOT NULL,
  PRIMARY KEY (video_id, cast_id)
);

CREATE TABLE IF NOT EXISTS scene_cast (
  scene_id        uuid NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  cast_id         text NOT NULL REFERENCES cast_members(id),
  PRIMARY KEY (scene_id, cast_id)
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

CREATE TABLE IF NOT EXISTS payments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id),
  pack_id         text NOT NULL,
  credits         integer NOT NULL,
  amount_inr      integer NOT NULL,
  provider        text NOT NULL DEFAULT 'pine_labs',
  provider_ref    text,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN (
                    'pending', 'paid', 'failed', 'mocked',
                    'pending_verification', 'rejected'
                  )),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_ref_key
  ON payments (provider_ref)
  WHERE provider_ref IS NOT NULL;

CREATE TABLE IF NOT EXISTS events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES users(id),
  video_id        uuid REFERENCES videos(id),
  kind            text NOT NULL CHECK (kind IN (
                    'signup', 'chat_started', 'stage_enter', 'approval',
                    'reject', 'regenerate', 'payment', 'render_done',
                    'download', 'agent_activity'
                  )),
  payload         jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_created ON events(created_at DESC);
