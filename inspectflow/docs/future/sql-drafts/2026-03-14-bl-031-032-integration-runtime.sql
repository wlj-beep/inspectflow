-- Draft for BL-031 / BL-032
-- Contract IDs: INT-CONNECTOR-v2, INT-IDEMPOTENCY-v2

CREATE TABLE IF NOT EXISTS connector_runs_v2 (
  id BIGSERIAL PRIMARY KEY,
  connector_id TEXT NOT NULL,
  run_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  run_completed_at TIMESTAMPTZ,
  outcome TEXT NOT NULL,
  policy_snapshot JSONB NOT NULL,
  stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_connector_runs_v2_connector_time
  ON connector_runs_v2 (connector_id, run_started_at DESC);

CREATE TABLE IF NOT EXISTS idempotency_ledger_v2 (
  id BIGSERIAL PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  connector_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  external_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  envelope_hash TEXT NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  hit_count INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_idempotency_ledger_v2_lookup
  ON idempotency_ledger_v2 (connector_id, entity_type, external_id);
