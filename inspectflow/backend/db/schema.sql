-- InspectFlow MVP schema (logical first pass)

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('Operator','Quality','Supervisor','Admin')),
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS user_site_access (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  site_id TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, site_id)
);

CREATE TABLE IF NOT EXISTS tools (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('Variable','Go/No-Go','Attribute')),
  it_num TEXT NOT NULL,
  calibration_due_date DATE,
  current_location_id INTEGER,
  home_location_id INTEGER,
  size TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  visible BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS tool_locations (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  location_type TEXT NOT NULL CHECK (location_type IN ('machine','user','job','vendor','out_for_calibration'))
);

CREATE TABLE IF NOT EXISTS parts (
  id TEXT PRIMARY KEY,
  description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS part_setup_revisions (
  id SERIAL PRIMARY KEY,
  part_id TEXT NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
  revision_code TEXT NOT NULL,
  revision_index INTEGER NOT NULL,
  part_name TEXT NOT NULL,
  snapshot JSONB NOT NULL,
  change_summary TEXT NOT NULL,
  changed_fields TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  created_by_role TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (part_id, revision_code),
  UNIQUE (part_id, revision_index)
);

CREATE TABLE IF NOT EXISTS operations (
  id SERIAL PRIMARY KEY,
  part_id TEXT NOT NULL REFERENCES parts(id),
  op_number TEXT NOT NULL,
  label TEXT NOT NULL,
  UNIQUE (part_id, op_number)
);

CREATE TABLE IF NOT EXISTS work_centers (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS work_center_audit_log (
  id SERIAL PRIMARY KEY,
  work_center_id INTEGER REFERENCES work_centers(id) ON DELETE SET NULL,
  operation_id INTEGER REFERENCES operations(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('create','update','delete','assign')),
  before_value JSONB,
  after_value JSONB,
  reason TEXT,
  changed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  changed_by_role TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS operation_work_center_history (
  id SERIAL PRIMARY KEY,
  operation_id INTEGER NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
  part_id TEXT NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
  before_work_center_id INTEGER REFERENCES work_centers(id) ON DELETE SET NULL,
  after_work_center_id INTEGER REFERENCES work_centers(id) ON DELETE SET NULL,
  changed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  changed_by_role TEXT,
  reason TEXT NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dimensions (
  id SERIAL PRIMARY KEY,
  operation_id INTEGER NOT NULL REFERENCES operations(id),
  name TEXT NOT NULL,
  nominal NUMERIC NOT NULL,
  tol_plus NUMERIC NOT NULL,
  tol_minus NUMERIC NOT NULL,
  unit TEXT NOT NULL CHECK (unit IN ('in','mm','Ra','deg')),
  sampling TEXT NOT NULL CHECK (sampling IN ('first_last','first_middle_last','every_5','every_10','100pct','custom_interval')),
  sampling_interval INTEGER CHECK (sampling_interval IS NULL OR sampling_interval > 0),
  input_mode TEXT NOT NULL DEFAULT 'single' CHECK (input_mode IN ('single','range')),
  UNIQUE (operation_id, name)
);

CREATE TABLE IF NOT EXISTS dimension_tools (
  dimension_id INTEGER NOT NULL REFERENCES dimensions(id),
  tool_id INTEGER NOT NULL REFERENCES tools(id),
  PRIMARY KEY (dimension_id, tool_id)
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  part_id TEXT NOT NULL REFERENCES parts(id),
  part_revision_code TEXT NOT NULL DEFAULT 'A',
  operation_id INTEGER NOT NULL REFERENCES operations(id),
  lot TEXT NOT NULL,
  qty INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open','closed','draft','incomplete')),
  lock_owner_user_id INTEGER REFERENCES users(id),
  lock_timestamp TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS records (
  id SERIAL PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  part_id TEXT NOT NULL REFERENCES parts(id),
  operation_id INTEGER NOT NULL REFERENCES operations(id),
  lot TEXT NOT NULL,
  serial_number TEXT,
  qty INTEGER NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  operator_user_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL CHECK (status IN ('complete','incomplete')),
  oot BOOLEAN NOT NULL DEFAULT FALSE,
  comment TEXT
);

CREATE TABLE IF NOT EXISTS record_piece_comments (
  id SERIAL PRIMARY KEY,
  record_id INTEGER NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  piece_number INTEGER NOT NULL CHECK (piece_number > 0),
  comment TEXT NOT NULL,
  serial_number TEXT,
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_by_role TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (record_id, piece_number)
);

CREATE TABLE IF NOT EXISTS record_piece_comment_audit (
  id SERIAL PRIMARY KEY,
  piece_comment_id INTEGER REFERENCES record_piece_comments(id) ON DELETE SET NULL,
  record_id INTEGER NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  piece_number INTEGER NOT NULL CHECK (piece_number > 0),
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  user_role TEXT,
  before_comment TEXT,
  before_serial_number TEXT,
  after_comment TEXT,
  after_serial_number TEXT,
  reason TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS job_quantity_adjustments (
  id SERIAL PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  before_qty INTEGER NOT NULL CHECK (before_qty > 0),
  after_qty INTEGER NOT NULL CHECK (after_qty > 0),
  reason TEXT NOT NULL,
  actor_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  actor_role TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS record_values (
  record_id INTEGER NOT NULL REFERENCES records(id),
  dimension_id INTEGER NOT NULL REFERENCES dimensions(id),
  piece_number INTEGER NOT NULL,
  value TEXT NOT NULL,
  is_oot BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (record_id, dimension_id, piece_number)
);

CREATE TABLE IF NOT EXISTS record_dimension_snapshots (
  record_id INTEGER NOT NULL REFERENCES records(id),
  dimension_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  nominal NUMERIC NOT NULL,
  tol_plus NUMERIC NOT NULL,
  tol_minus NUMERIC NOT NULL,
  unit TEXT NOT NULL,
  sampling TEXT NOT NULL,
  sampling_interval INTEGER,
  input_mode TEXT NOT NULL DEFAULT 'single' CHECK (input_mode IN ('single','range')),
  PRIMARY KEY (record_id, dimension_id)
);

CREATE TABLE IF NOT EXISTS record_tools (
  record_id INTEGER NOT NULL REFERENCES records(id),
  dimension_id INTEGER NOT NULL REFERENCES dimensions(id),
  tool_id INTEGER NOT NULL REFERENCES tools(id),
  it_num TEXT NOT NULL,
  PRIMARY KEY (record_id, dimension_id, tool_id)
);

CREATE TABLE IF NOT EXISTS missing_pieces (
  record_id INTEGER NOT NULL REFERENCES records(id),
  piece_number INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('Scrapped','Lost','Damaged','Other','Unable to Measure')),
  nc_num TEXT,
  details TEXT,
  PRIMARY KEY (record_id, piece_number)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  record_id INTEGER NOT NULL REFERENCES records(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  field TEXT NOT NULL,
  before_value TEXT,
  after_value TEXT,
  reason TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS issue_reports (
  id SERIAL PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN (
    'part_issue',
    'tolerance_issue',
    'dimension_issue',
    'operation_mapping_issue',
    'app_functionality_issue',
    'tool_issue',
    'sampling_issue',
    'other'
  )),
  details TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','completed')),
  part_id TEXT REFERENCES parts(id),
  operation_id INTEGER REFERENCES operations(id),
  dimension_id INTEGER REFERENCES dimensions(id),
  job_id TEXT REFERENCES jobs(id),
  record_id INTEGER REFERENCES records(id),
  submitted_by_user_id INTEGER NOT NULL REFERENCES users(id),
  submitted_by_role TEXT NOT NULL CHECK (submitted_by_role IN ('Operator','Quality','Supervisor','Admin')),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_by_user_id INTEGER REFERENCES users(id),
  resolved_at TIMESTAMPTZ,
  resolution_note TEXT
);

ALTER TABLE tools ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE tools ADD COLUMN IF NOT EXISTS visible BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE tools ADD COLUMN IF NOT EXISTS size TEXT;
ALTER TABLE tools ADD COLUMN IF NOT EXISTS calibration_due_date DATE;
ALTER TABLE tools ADD COLUMN IF NOT EXISTS current_location_id INTEGER;
ALTER TABLE tools ADD COLUMN IF NOT EXISTS home_location_id INTEGER;
ALTER TABLE tools DROP CONSTRAINT IF EXISTS tools_current_location_id_fkey;
ALTER TABLE tools ADD CONSTRAINT tools_current_location_id_fkey FOREIGN KEY (current_location_id) REFERENCES tool_locations(id);
ALTER TABLE tools DROP CONSTRAINT IF EXISTS tools_home_location_id_fkey;
ALTER TABLE tools ADD CONSTRAINT tools_home_location_id_fkey FOREIGN KEY (home_location_id) REFERENCES tool_locations(id);
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('Operator','Quality','Supervisor','Admin'));

CREATE TABLE IF NOT EXISTS role_capabilities (
  role TEXT NOT NULL CHECK (role IN ('Operator','Quality','Supervisor','Admin')),
  capability TEXT NOT NULL,
  PRIMARY KEY (role, capability)
);

CREATE TABLE IF NOT EXISTS auth_local_credentials (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  password_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  must_rotate_password BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT,
  ip_address TEXT,
  user_agent TEXT
);

CREATE TABLE IF NOT EXISTS auth_event_log (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'login_success',
    'login_failure',
    'login_locked',
    'logout',
    'password_changed',
    'password_change_failure',
    'password_reset_default',
    'entitlements_updated',
    'seat_soft_limit_warning',
    'seat_hard_limit_block'
  )),
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_role TEXT CHECK (actor_role IS NULL OR actor_role IN ('Operator','Quality','Supervisor','Admin')),
  session_id BIGINT REFERENCES auth_sessions(id) ON DELETE SET NULL,
  username TEXT,
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE auth_event_log DROP CONSTRAINT IF EXISTS auth_event_log_event_type_check;
ALTER TABLE auth_event_log ADD CONSTRAINT auth_event_log_event_type_check CHECK (event_type IN (
  'login_success',
  'login_failure',
  'login_locked',
  'logout',
  'password_changed',
  'password_change_failure',
  'password_reset_default',
  'entitlements_updated',
  'seat_soft_limit_warning',
  'seat_hard_limit_block'
));

CREATE TABLE IF NOT EXISTS platform_entitlements (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  contract_id TEXT NOT NULL DEFAULT 'PLAT-ENT-v1',
  license_tier TEXT NOT NULL DEFAULT 'core',
  seat_pack INTEGER NOT NULL DEFAULT 25 CHECK (seat_pack > 0),
  seat_soft_limit INTEGER NOT NULL DEFAULT 25 CHECK (seat_soft_limit > 0),
  seat_policy JSONB NOT NULL DEFAULT '{"mode":"soft","enforced":false,"hardLimit":0,"namedUsers":[],"allowedDevices":[]}'::JSONB,
  diagnostics_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
  module_flags JSONB NOT NULL DEFAULT '{"CORE": true, "QUALITY_PRO": false, "INTEGRATION_SUITE": false, "ANALYTICS_SUITE": false, "MULTISITE": false, "EDGE": false}'::JSONB,
  updated_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE platform_entitlements
  ADD COLUMN IF NOT EXISTS seat_policy JSONB NOT NULL DEFAULT '{"mode":"soft","enforced":false,"hardLimit":0,"namedUsers":[],"allowedDevices":[]}'::JSONB;

CREATE TABLE IF NOT EXISTS user_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  start_ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_ts TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS import_integrations (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  source_type TEXT NOT NULL CHECK (source_type IN ('api_pull','webhook','excel_sheet')),
  import_type TEXT NOT NULL CHECK (import_type IN ('tools','part_dimensions','jobs','measurements')),
  endpoint_url TEXT,
  auth_header TEXT,
  poll_interval_minutes INTEGER CHECK (poll_interval_minutes IS NULL OR poll_interval_minutes >= 1),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  options JSONB NOT NULL DEFAULT '{}'::JSONB,
  last_run_at TIMESTAMPTZ,
  last_status TEXT,
  last_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS import_runs (
  id SERIAL PRIMARY KEY,
  integration_id INTEGER REFERENCES import_integrations(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL,
  import_type TEXT NOT NULL,
  trigger_mode TEXT NOT NULL CHECK (trigger_mode IN ('manual','webhook','scheduled')),
  status TEXT NOT NULL CHECK (status IN ('success','partial','error')),
  total_rows INTEGER NOT NULL DEFAULT 0,
  inserted_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  summary JSONB NOT NULL DEFAULT '{}'::JSONB,
  errors JSONB NOT NULL DEFAULT '[]'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS import_unresolved_items (
  id SERIAL PRIMARY KEY,
  run_id INTEGER REFERENCES import_runs(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL,
  import_type TEXT NOT NULL CHECK (import_type IN ('measurements')),
  line_number INTEGER,
  reason TEXT NOT NULL,
  confidence NUMERIC,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','ignored')),
  resolved_payload JSONB,
  resolved_by_role TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS import_idempotency_ledger (
  id BIGSERIAL PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  source_type TEXT NOT NULL,
  import_type TEXT NOT NULL,
  external_key TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  payload_bytes INTEGER NOT NULL DEFAULT 0,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  hit_count INTEGER NOT NULL DEFAULT 1,
  first_run_id INTEGER REFERENCES import_runs(id) ON DELETE SET NULL,
  last_run_id INTEGER REFERENCES import_runs(id) ON DELETE SET NULL,
  first_status TEXT,
  last_status TEXT
);

CREATE TABLE IF NOT EXISTS import_external_entity_refs (
  id BIGSERIAL PRIMARY KEY,
  import_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  external_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  latest_internal_ref JSONB NOT NULL DEFAULT '{}'::JSONB,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  hit_count INTEGER NOT NULL DEFAULT 1,
  first_run_id INTEGER REFERENCES import_runs(id) ON DELETE SET NULL,
  last_run_id INTEGER REFERENCES import_runs(id) ON DELETE SET NULL,
  UNIQUE (import_type, entity_type, external_id)
);

CREATE TABLE IF NOT EXISTS ana_mart_inspection_fact (
  record_id INTEGER NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  dimension_id INTEGER NOT NULL,
  piece_number INTEGER NOT NULL,
  site_id TEXT NOT NULL DEFAULT 'default',
  job_id TEXT NOT NULL,
  part_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  lot TEXT,
  work_center_id TEXT,
  operator_user_id INTEGER,
  event_at TIMESTAMPTZ NOT NULL,
  measurement_count INTEGER NOT NULL DEFAULT 1,
  oot_count INTEGER NOT NULL DEFAULT 0,
  pass_count INTEGER NOT NULL DEFAULT 0,
  rework_count INTEGER NOT NULL DEFAULT 0,
  source_run_id INTEGER REFERENCES import_runs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (site_id, record_id, dimension_id, piece_number)
);

CREATE TABLE IF NOT EXISTS ana_mart_connector_run_fact (
  run_id INTEGER NOT NULL REFERENCES import_runs(id) ON DELETE CASCADE,
  site_id TEXT NOT NULL DEFAULT 'default',
  connector_id TEXT NOT NULL,
  status TEXT NOT NULL,
  run_count INTEGER NOT NULL DEFAULT 1,
  failure_count INTEGER NOT NULL DEFAULT 0,
  replayed_count INTEGER NOT NULL DEFAULT 0,
  processed_count INTEGER NOT NULL DEFAULT 0,
  avg_latency_ms INTEGER,
  run_ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (site_id, run_id)
);

CREATE TABLE IF NOT EXISTS ana_mart_job_rollup_day (
  site_id TEXT NOT NULL DEFAULT 'default',
  rollup_date DATE NOT NULL,
  part_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  total_pieces INTEGER NOT NULL,
  pass_pieces INTEGER NOT NULL,
  oot_pieces INTEGER NOT NULL,
  correction_events INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (site_id, rollup_date, part_id, job_id)
);

CREATE TABLE IF NOT EXISTS ana_mart_build_runs (
  id BIGSERIAL PRIMARY KEY,
  site_id TEXT NOT NULL DEFAULT 'default',
  trigger_source TEXT NOT NULL,
  requested_by_role TEXT,
  requested_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  transform_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success','error')),
  source_snapshot JSONB NOT NULL DEFAULT '{}'::JSONB,
  output_snapshot JSONB NOT NULL DEFAULT '{}'::JSONB,
  error_payload JSONB,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE ana_mart_build_runs ADD COLUMN IF NOT EXISTS site_id TEXT NOT NULL DEFAULT 'default';

CREATE TABLE IF NOT EXISTS ana_risk_event_log (
  id BIGSERIAL PRIMARY KEY,
  dedupe_key TEXT NOT NULL UNIQUE,
  contract_id TEXT NOT NULL,
  source TEXT NOT NULL,
  severity TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved')),
  event_envelope JSONB NOT NULL,
  escalation_record JSONB NOT NULL,
  context JSONB NOT NULL DEFAULT '{}'::JSONB,
  hit_count INTEGER NOT NULL DEFAULT 1,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_by_role TEXT,
  acknowledged_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  acknowledgement_note TEXT,
  acknowledged_at TIMESTAMPTZ,
  linked_issue_id INTEGER REFERENCES issue_reports(id) ON DELETE SET NULL,
  resolved_by_role TEXT,
  resolved_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  resolution_note TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS platform_extensions (
  plugin_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  version TEXT NOT NULL,
  sdk_version TEXT NOT NULL DEFAULT 'EDGE-SDK-v1',
  manifest_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  policy_status TEXT NOT NULL DEFAULT 'blocked' CHECK (policy_status IN ('allowed','blocked')),
  policy_findings_json JSONB NOT NULL DEFAULT '[]'::JSONB,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  required_module TEXT NOT NULL DEFAULT 'EDGE',
  updated_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by_role TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE missing_pieces DROP CONSTRAINT IF EXISTS missing_pieces_reason_check;
ALTER TABLE missing_pieces ADD CONSTRAINT missing_pieces_reason_check CHECK (reason IN ('Scrapped','Lost','Damaged','Other','Unable to Measure'));
ALTER TABLE dimensions ADD COLUMN IF NOT EXISTS sampling_interval INTEGER;
ALTER TABLE dimensions DROP CONSTRAINT IF EXISTS dimensions_sampling_interval_check;
ALTER TABLE dimensions ADD CONSTRAINT dimensions_sampling_interval_check CHECK (sampling_interval IS NULL OR sampling_interval > 0);
ALTER TABLE dimensions DROP CONSTRAINT IF EXISTS dimensions_sampling_check;
ALTER TABLE dimensions ADD CONSTRAINT dimensions_sampling_check CHECK (sampling IN ('first_last','first_middle_last','every_5','every_10','100pct','custom_interval'));
ALTER TABLE dimensions ADD COLUMN IF NOT EXISTS input_mode TEXT NOT NULL DEFAULT 'single';
ALTER TABLE dimensions DROP CONSTRAINT IF EXISTS dimensions_input_mode_check;
ALTER TABLE dimensions ADD CONSTRAINT dimensions_input_mode_check CHECK (input_mode IN ('single','range'));
ALTER TABLE record_tools DROP CONSTRAINT IF EXISTS record_tools_pkey;
ALTER TABLE record_tools ADD CONSTRAINT record_tools_pkey PRIMARY KEY (record_id, dimension_id, tool_id);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS part_revision_code TEXT NOT NULL DEFAULT 'A';
ALTER TABLE operations ADD COLUMN IF NOT EXISTS work_center_id INTEGER;
ALTER TABLE operations DROP CONSTRAINT IF EXISTS operations_work_center_id_fkey;
ALTER TABLE operations ADD CONSTRAINT operations_work_center_id_fkey FOREIGN KEY (work_center_id) REFERENCES work_centers(id) ON DELETE SET NULL;
ALTER TABLE records ADD COLUMN IF NOT EXISTS serial_number TEXT;
ALTER TABLE ana_risk_event_log ADD COLUMN IF NOT EXISTS acknowledged_by_role TEXT;
ALTER TABLE ana_risk_event_log ADD COLUMN IF NOT EXISTS acknowledged_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE ana_risk_event_log ADD COLUMN IF NOT EXISTS acknowledgement_note TEXT;
ALTER TABLE ana_risk_event_log ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ;
ALTER TABLE ana_risk_event_log ADD COLUMN IF NOT EXISTS linked_issue_id INTEGER REFERENCES issue_reports(id) ON DELETE SET NULL;
ALTER TABLE ana_mart_inspection_fact DROP CONSTRAINT IF EXISTS ana_mart_inspection_fact_pkey;
ALTER TABLE ana_mart_inspection_fact
  ADD CONSTRAINT ana_mart_inspection_fact_pkey PRIMARY KEY (site_id, record_id, dimension_id, piece_number);
ALTER TABLE ana_mart_connector_run_fact DROP CONSTRAINT IF EXISTS ana_mart_connector_run_fact_pkey;
ALTER TABLE ana_mart_connector_run_fact
  ADD CONSTRAINT ana_mart_connector_run_fact_pkey PRIMARY KEY (site_id, run_id);
INSERT INTO user_site_access (user_id, site_id, is_default)
SELECT id, 'default', true
FROM users
ON CONFLICT (user_id, site_id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_part_setup_revisions_part_latest
ON part_setup_revisions (part_id, revision_index DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_site_access_default
ON user_site_access (user_id)
WHERE is_default;
CREATE INDEX IF NOT EXISTS idx_tool_locations_type
ON tool_locations (location_type);
CREATE INDEX IF NOT EXISTS idx_import_integrations_enabled
ON import_integrations (enabled);
CREATE INDEX IF NOT EXISTS idx_import_runs_created
ON import_runs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_import_unresolved_status
ON import_unresolved_items (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_import_idempotency_lookup
ON import_idempotency_ledger (source_type, import_type, external_key);
CREATE INDEX IF NOT EXISTS idx_import_external_refs_lookup
ON import_external_entity_refs (import_type, entity_type, external_id);
CREATE INDEX IF NOT EXISTS idx_ana_mart_inspection_event_at
ON ana_mart_inspection_fact (event_at DESC);
CREATE INDEX IF NOT EXISTS idx_ana_mart_inspection_job
ON ana_mart_inspection_fact (job_id, part_id, operation_id);
CREATE INDEX IF NOT EXISTS idx_ana_mart_connector_run_ended
ON ana_mart_connector_run_fact (run_ended_at DESC);
CREATE INDEX IF NOT EXISTS idx_ana_mart_connector_status
ON ana_mart_connector_run_fact (connector_id, status);
CREATE INDEX IF NOT EXISTS idx_ana_mart_job_rollup_date
ON ana_mart_job_rollup_day (rollup_date DESC, part_id, job_id);
CREATE INDEX IF NOT EXISTS idx_ana_mart_build_runs_created
ON ana_mart_build_runs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ana_mart_build_runs_site_created
ON ana_mart_build_runs (site_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ana_risk_event_status
ON ana_risk_event_log (status, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_ana_risk_event_linked_issue
ON ana_risk_event_log (linked_issue_id);
CREATE INDEX IF NOT EXISTS idx_platform_extensions_enabled
ON platform_extensions (enabled, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_extensions_policy_status
ON platform_extensions (policy_status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_operations_work_center_id
ON operations (work_center_id);
CREATE INDEX IF NOT EXISTS idx_work_centers_active
ON work_centers (active, code);
CREATE INDEX IF NOT EXISTS idx_work_center_audit_log_work_center
ON work_center_audit_log (work_center_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_operation_work_center_history_operation
ON operation_work_center_history (operation_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_record_piece_comments_record
ON record_piece_comments (record_id, piece_number);
CREATE INDEX IF NOT EXISTS idx_record_piece_comments_serial
ON record_piece_comments (serial_number);
CREATE INDEX IF NOT EXISTS idx_record_piece_comment_audit_record
ON record_piece_comment_audit (record_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_job_quantity_adjustments_job
ON job_quantity_adjustments (job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_records_serial_number
ON records (serial_number);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_active
ON auth_sessions (user_id, revoked_at, expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_event_log_created
ON auth_event_log (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_auth_event_log_type_created
ON auth_event_log (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_event_log_user_created
ON auth_event_log (user_id, created_at DESC);
