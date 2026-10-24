-- Mars payments slice of docs/14 §3.
-- provider_ref is unique when set so a Pine Labs link id cannot be stored twice.
-- That partial unique index is not in §3; lookup and idempotency need it.

CREATE TABLE IF NOT EXISTS payments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id),
  pack_id         text NOT NULL,
  credits         integer NOT NULL,
  amount_inr      integer NOT NULL,
  provider        text NOT NULL DEFAULT 'pine_labs',
  provider_ref    text,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN (
                    'pending', 'paid', 'failed', 'mocked'
                  )),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_ref_key
  ON payments (provider_ref)
  WHERE provider_ref IS NOT NULL;
