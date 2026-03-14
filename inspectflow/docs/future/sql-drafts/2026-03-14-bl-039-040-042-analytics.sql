-- Draft for BL-039 / BL-040 / BL-042
-- Contract IDs: ANA-MART-v3, ANA-KPI-v3, ANA-RISK-v3

CREATE TABLE IF NOT EXISTS analytics_kpi_definitions_v3 (
  id BIGSERIAL PRIMARY KEY,
  kpi_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  mart_id TEXT NOT NULL,
  definition JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS analytics_anomaly_events_v3 (
  id BIGSERIAL PRIMARY KEY,
  event_key TEXT NOT NULL UNIQUE,
  rule_id TEXT NOT NULL,
  severity TEXT NOT NULL,
  trigger_at TIMESTAMPTZ NOT NULL,
  context JSONB NOT NULL,
  evidence JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_anomaly_events_v3_rule_time
  ON analytics_anomaly_events_v3 (rule_id, trigger_at DESC);
