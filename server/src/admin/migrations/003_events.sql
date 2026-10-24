-- Mars traction log. Columns match docs/14 §3 events.
-- Saturn owns server/src/db/migrations; this file stays under server/src/admin.

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

CREATE INDEX IF NOT EXISTS events_created ON events (created_at DESC);
