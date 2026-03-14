-- Draft for BL-034 / BL-035
-- Contract IDs: QUAL-FAI-v2, QUAL-EXPORT-v1

CREATE TABLE IF NOT EXISTS export_profiles_v2 (
  id BIGSERIAL PRIMARY KEY,
  profile_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  template_ids JSONB NOT NULL,
  defaults JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS export_templates_v2 (
  id BIGSERIAL PRIMARY KEY,
  template_id TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_export_profiles_v2_active
  ON export_profiles_v2 (is_active, profile_id);
