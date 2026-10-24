-- PhonePe UTR review. Pine Labs statuses stay valid.
-- pg-mem names the 001 inline CHECK payments_constraint_1.
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_status_check;
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_constraint_1;
ALTER TABLE payments ADD CONSTRAINT payments_status_check CHECK (status IN (
  'pending', 'paid', 'failed', 'mocked', 'pending_verification', 'rejected'
));

CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_ref_key
  ON payments (provider_ref)
  WHERE provider_ref IS NOT NULL;
