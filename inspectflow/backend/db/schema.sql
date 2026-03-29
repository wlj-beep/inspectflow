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

CREATE TABLE IF NOT EXISTS operation_instruction_sets (
  id BIGSERIAL PRIMARY KEY,
  operation_id INTEGER NOT NULL UNIQUE REFERENCES operations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS operation_instruction_versions (
  id BIGSERIAL PRIMARY KEY,
  instruction_set_id BIGINT NOT NULL REFERENCES operation_instruction_sets(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  status TEXT NOT NULL CHECK (status IN ('draft','published','superseded')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  change_summary TEXT,
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_by_role TEXT CHECK (created_by_role IS NULL OR created_by_role IN ('Operator','Quality','Supervisor','Admin')),
  published_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  published_by_role TEXT CHECK (published_by_role IS NULL OR published_by_role IN ('Operator','Quality','Supervisor','Admin')),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (instruction_set_id, version_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS operation_instruction_versions_one_published_idx
  ON operation_instruction_versions (instruction_set_id)
  WHERE status = 'published';

CREATE TABLE IF NOT EXISTS operation_instruction_media_links (
  id BIGSERIAL PRIMARY KEY,
  instruction_version_id BIGINT NOT NULL REFERENCES operation_instruction_versions(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL CHECK (media_type IN ('image','video','document','link')),
  label TEXT NOT NULL,
  url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
  bubble_number TEXT,
  feature_type TEXT,
  gdt_class TEXT,
  tolerance_zone TEXT,
  feature_quantity INTEGER CHECK (feature_quantity IS NULL OR feature_quantity > 0),
  feature_units TEXT,
  feature_modifiers_json JSONB NOT NULL DEFAULT '[]'::JSONB,
  source_characteristic_key TEXT,
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

CREATE TABLE IF NOT EXISTS characteristic_schema_audit_log (
  id BIGSERIAL PRIMARY KEY,
  dimension_id INTEGER REFERENCES dimensions(id) ON DELETE SET NULL,
  operation_id INTEGER REFERENCES operations(id) ON DELETE SET NULL,
  part_id TEXT REFERENCES parts(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('create','update','delete')),
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_role TEXT,
  source TEXT NOT NULL DEFAULT 'admin_ui',
  reason TEXT,
  before_value JSONB,
  after_value JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
  comment TEXT,
  deleted_at TIMESTAMPTZ
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

CREATE TABLE IF NOT EXISTS record_attachments (
  id BIGSERIAL PRIMARY KEY,
  record_id INTEGER NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  piece_number INTEGER CHECK (piece_number IS NULL OR piece_number > 0),
  file_name TEXT NOT NULL,
  media_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size > 0),
  data_base64 TEXT NOT NULL,
  retention_until TIMESTAMPTZ NOT NULL,
  uploaded_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  uploaded_by_role TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS fai_packages (
  id BIGSERIAL PRIMARY KEY,
  context_type TEXT NOT NULL CHECK (context_type IN ('part_lot','job','record')),
  part_id TEXT NOT NULL REFERENCES parts(id) ON DELETE RESTRICT,
  lot TEXT NOT NULL,
  operation_id INTEGER REFERENCES operations(id) ON DELETE SET NULL,
  job_id TEXT REFERENCES jobs(id) ON DELETE SET NULL,
  record_id INTEGER REFERENCES records(id) ON DELETE SET NULL,
  profile_id TEXT NOT NULL DEFAULT 'as9102-basic',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','finalized')),
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_by_role TEXT CHECK (created_by_role IS NULL OR created_by_role IN ('Operator','Quality','Supervisor','Admin')),
  finalized_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  finalized_by_role TEXT CHECK (finalized_by_role IS NULL OR finalized_by_role IN ('Operator','Quality','Supervisor','Admin')),
  finalized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (context_type = 'part_lot' AND job_id IS NULL AND record_id IS NULL)
    OR
    (context_type = 'job' AND job_id IS NOT NULL AND record_id IS NULL)
    OR
    (context_type = 'record' AND record_id IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS fai_package_characteristic_signoffs (
  id BIGSERIAL PRIMARY KEY,
  package_id BIGINT NOT NULL REFERENCES fai_packages(id) ON DELETE CASCADE,
  dimension_id INTEGER NOT NULL REFERENCES dimensions(id) ON DELETE CASCADE,
  disposition TEXT NOT NULL CHECK (disposition IN ('approved','rejected')),
  note TEXT,
  signed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  signed_by_role TEXT CHECK (signed_by_role IS NULL OR signed_by_role IN ('Operator','Quality','Supervisor','Admin')),
  signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (package_id, dimension_id)
);

CREATE TABLE IF NOT EXISTS fai_package_status_history (
  id BIGSERIAL PRIMARY KEY,
  package_id BIGINT NOT NULL REFERENCES fai_packages(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('created','signoff_recorded','finalized')),
  from_status TEXT CHECK (from_status IS NULL OR from_status IN ('open','finalized')),
  to_status TEXT CHECK (to_status IS NULL OR to_status IN ('open','finalized')),
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_role TEXT CHECK (actor_role IS NULL OR actor_role IN ('Operator','Quality','Supervisor','Admin')),
  detail_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS instruction_acknowledgments (
  id BIGSERIAL PRIMARY KEY,
  instruction_version_id BIGINT NOT NULL REFERENCES operation_instruction_versions(id) ON DELETE CASCADE,
  operator_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  acknowledged_role TEXT NOT NULL CHECK (acknowledged_role IN ('Operator','Quality','Supervisor','Admin')),
  context_type TEXT NOT NULL CHECK (context_type IN ('job','record')),
  job_id TEXT REFERENCES jobs(id) ON DELETE CASCADE,
  record_id INTEGER REFERENCES records(id) ON DELETE CASCADE,
  acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (context_type = 'job' AND job_id IS NOT NULL AND record_id IS NULL)
    OR
    (context_type = 'record' AND record_id IS NOT NULL AND job_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS instruction_acknowledgments_job_unique_idx
  ON instruction_acknowledgments (instruction_version_id, operator_user_id, job_id)
  WHERE context_type = 'job';

CREATE UNIQUE INDEX IF NOT EXISTS instruction_acknowledgments_record_unique_idx
  ON instruction_acknowledgments (instruction_version_id, operator_user_id, record_id)
  WHERE context_type = 'record';

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
  bubble_number TEXT,
  feature_type TEXT,
  gdt_class TEXT,
  tolerance_zone TEXT,
  feature_quantity INTEGER,
  feature_units TEXT,
  feature_modifiers_json JSONB NOT NULL DEFAULT '[]'::JSONB,
  source_characteristic_key TEXT,
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
    'seat_hard_limit_block',
    'password_rotation_token_issued',
    'password_rotation_token_attempt',
    'password_rotation_token_locked',
    'password_rotation_token_consumed',
    'user_updated',
    'admin_role_assigned'
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
  'seat_hard_limit_block',
  'password_rotation_token_issued',
  'password_rotation_token_attempt',
  'password_rotation_token_locked',
  'password_rotation_token_consumed',
  'user_updated',
  'admin_role_assigned'
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
  module_policy_profile TEXT NOT NULL DEFAULT 'core_starter',
  updated_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE platform_entitlements
  ADD COLUMN IF NOT EXISTS seat_policy JSONB NOT NULL DEFAULT '{"mode":"soft","enforced":false,"hardLimit":0,"namedUsers":[],"allowedDevices":[]}'::JSONB;
ALTER TABLE platform_entitlements
  ADD COLUMN IF NOT EXISTS module_policy_profile TEXT NOT NULL DEFAULT 'core_starter';

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

CREATE TABLE IF NOT EXISTS partner_connector_kits (
  connector_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  version TEXT NOT NULL,
  sdk_plugin_id TEXT REFERENCES platform_extensions(plugin_id) ON DELETE SET NULL,
  source_types_json JSONB NOT NULL DEFAULT '[]'::JSONB,
  import_types_json JSONB NOT NULL DEFAULT '[]'::JSONB,
  manifest_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  validation_status TEXT NOT NULL DEFAULT 'invalid' CHECK (validation_status IN ('valid','invalid')),
  validation_findings_json JSONB NOT NULL DEFAULT '[]'::JSONB,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by_role TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS edge_sync_runs (
  id BIGSERIAL PRIMARY KEY,
  contract_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('snapshot_export','payload_validate')),
  validation_status TEXT NOT NULL CHECK (validation_status IN ('valid','invalid')),
  payload_summary JSONB NOT NULL DEFAULT '{}'::JSONB,
  findings_json JSONB NOT NULL DEFAULT '[]'::JSONB,
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_role TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
ALTER TABLE dimensions ADD COLUMN IF NOT EXISTS bubble_number TEXT;
ALTER TABLE dimensions ADD COLUMN IF NOT EXISTS feature_type TEXT;
ALTER TABLE dimensions ADD COLUMN IF NOT EXISTS gdt_class TEXT;
ALTER TABLE dimensions ADD COLUMN IF NOT EXISTS tolerance_zone TEXT;
ALTER TABLE dimensions ADD COLUMN IF NOT EXISTS feature_quantity INTEGER;
ALTER TABLE dimensions DROP CONSTRAINT IF EXISTS dimensions_feature_quantity_check;
ALTER TABLE dimensions ADD CONSTRAINT dimensions_feature_quantity_check CHECK (feature_quantity IS NULL OR feature_quantity > 0);
ALTER TABLE dimensions ADD COLUMN IF NOT EXISTS feature_units TEXT;
ALTER TABLE dimensions ADD COLUMN IF NOT EXISTS feature_modifiers_json JSONB NOT NULL DEFAULT '[]'::JSONB;
ALTER TABLE dimensions ADD COLUMN IF NOT EXISTS source_characteristic_key TEXT;
ALTER TABLE record_dimension_snapshots ADD COLUMN IF NOT EXISTS bubble_number TEXT;
ALTER TABLE record_dimension_snapshots ADD COLUMN IF NOT EXISTS feature_type TEXT;
ALTER TABLE record_dimension_snapshots ADD COLUMN IF NOT EXISTS gdt_class TEXT;
ALTER TABLE record_dimension_snapshots ADD COLUMN IF NOT EXISTS tolerance_zone TEXT;
ALTER TABLE record_dimension_snapshots ADD COLUMN IF NOT EXISTS feature_quantity INTEGER;
ALTER TABLE record_dimension_snapshots ADD COLUMN IF NOT EXISTS feature_units TEXT;
ALTER TABLE record_dimension_snapshots ADD COLUMN IF NOT EXISTS feature_modifiers_json JSONB NOT NULL DEFAULT '[]'::JSONB;
ALTER TABLE record_dimension_snapshots ADD COLUMN IF NOT EXISTS source_characteristic_key TEXT;
ALTER TABLE record_tools DROP CONSTRAINT IF EXISTS record_tools_pkey;
ALTER TABLE record_tools ADD CONSTRAINT record_tools_pkey PRIMARY KEY (record_id, dimension_id, tool_id);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS part_revision_code TEXT NOT NULL DEFAULT 'A';
ALTER TABLE operations ADD COLUMN IF NOT EXISTS work_center_id INTEGER;
ALTER TABLE operations DROP CONSTRAINT IF EXISTS operations_work_center_id_fkey;
ALTER TABLE operations ADD CONSTRAINT operations_work_center_id_fkey FOREIGN KEY (work_center_id) REFERENCES work_centers(id) ON DELETE SET NULL;
ALTER TABLE records ADD COLUMN IF NOT EXISTS serial_number TEXT;
ALTER TABLE records ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
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
CREATE INDEX IF NOT EXISTS idx_partner_connector_kits_enabled
ON partner_connector_kits (enabled, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_partner_connector_kits_validation_status
ON partner_connector_kits (validation_status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_edge_sync_runs_created
ON edge_sync_runs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_edge_sync_runs_status
ON edge_sync_runs (validation_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_operations_work_center_id
ON operations (work_center_id);
CREATE INDEX IF NOT EXISTS idx_dimensions_operation_id
ON dimensions (operation_id);
CREATE INDEX IF NOT EXISTS idx_records_operator_user_id
ON records (operator_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_record_id
ON audit_log (record_id);
CREATE INDEX IF NOT EXISTS idx_users_role
ON users (role);
CREATE INDEX IF NOT EXISTS idx_user_site_access_user
ON user_site_access (user_id, site_id);
CREATE INDEX IF NOT EXISTS idx_records_job_operation
ON records (job_id, operation_id, timestamp DESC);
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'records'
      AND column_name = 'site_id'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_records_site_id ON records (site_id)';
  END IF;
END $$;
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
CREATE INDEX IF NOT EXISTS idx_record_attachments_record
ON record_attachments (record_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_record_attachments_retention
ON record_attachments (retention_until ASC)
WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_fai_packages_scope
ON fai_packages (part_id, lot, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fai_packages_job
ON fai_packages (job_id, created_at DESC)
WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fai_packages_record
ON fai_packages (record_id, created_at DESC)
WHERE record_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fai_package_signoffs_package
ON fai_package_characteristic_signoffs (package_id, dimension_id);
CREATE INDEX IF NOT EXISTS idx_fai_package_history_package
ON fai_package_status_history (package_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_characteristic_schema_audit_dimension
ON characteristic_schema_audit_log (dimension_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_characteristic_schema_audit_part
ON characteristic_schema_audit_log (part_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_quantity_adjustments_job
ON job_quantity_adjustments (job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_records_serial_number
ON records (serial_number);
CREATE INDEX IF NOT EXISTS idx_records_deleted_at
ON records (deleted_at);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_active
ON auth_sessions (user_id, revoked_at, expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_event_log_created
ON auth_event_log (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_auth_event_log_type_created
ON auth_event_log (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_event_log_user_created
ON auth_event_log (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS password_rotation_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);
ALTER TABLE password_rotation_tokens
  ADD COLUMN IF NOT EXISTS failed_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE password_rotation_tokens
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_password_rotation_tokens_user
ON password_rotation_tokens (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_password_rotation_tokens_hash
ON password_rotation_tokens (token_hash)
WHERE used_at IS NULL;

-- BL-108: Nonconformance (NCR) workflow
CREATE TABLE IF NOT EXISTS nonconformances (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'pending_disposition', 'dispositioned', 'closed')),
  disposition TEXT CHECK (disposition IN ('use_as_is', 'rework', 'scrap', 'return_to_vendor', 'other')),
  disposition_notes TEXT,
  record_id INTEGER REFERENCES records(id),
  record_value_dimension_id INTEGER,
  record_value_piece_number INTEGER,
  part_id TEXT,
  job_id TEXT,
  created_by_user_id INTEGER REFERENCES users(id),
  dispositioned_by_user_id INTEGER REFERENCES users(id),
  closed_by_user_id INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dispositioned_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ
);
ALTER TABLE nonconformances DROP CONSTRAINT IF EXISTS nonconformances_disposition_check;
ALTER TABLE nonconformances ADD CONSTRAINT nonconformances_disposition_check CHECK (
  disposition IS NULL OR disposition IN ('use_as_is', 'rework', 'reject', 'scrap', 'return', 'return_to_vendor', 'other', 'void')
);

CREATE TABLE IF NOT EXISTS ncr_audit_log (
  id SERIAL PRIMARY KEY,
  ncr_id INTEGER NOT NULL REFERENCES nonconformances(id),
  event_type TEXT NOT NULL,
  actor_user_id INTEGER REFERENCES users(id),
  actor_role TEXT,
  from_status TEXT,
  to_status TEXT,
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nonconformances_status
ON nonconformances (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nonconformances_part_job
ON nonconformances (part_id, job_id);
CREATE INDEX IF NOT EXISTS idx_nonconformances_record
ON nonconformances (record_id)
WHERE record_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ncr_audit_log_ncr
ON ncr_audit_log (ncr_id, created_at DESC);

-- BL-109: CAPA module baseline
CREATE TABLE IF NOT EXISTS capa_records (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  problem_statement TEXT,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'effectiveness_verification', 'closed')),
  source_ncr_id INTEGER REFERENCES nonconformances(id) ON DELETE SET NULL,
  root_cause_method TEXT CHECK (root_cause_method IN ('5whys', 'fishbone', 'other')),
  root_cause_details TEXT,
  effectiveness_notes TEXT,
  due_at TIMESTAMPTZ,
  created_by_user_id INTEGER REFERENCES users(id),
  closed_by_user_id INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS capa_actions (
  id SERIAL PRIMARY KEY,
  capa_id INTEGER NOT NULL REFERENCES capa_records(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  assignee_user_id INTEGER REFERENCES users(id),
  due_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'done', 'canceled')),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS capa_audit_log (
  id SERIAL PRIMARY KEY,
  capa_id INTEGER NOT NULL REFERENCES capa_records(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_user_id INTEGER REFERENCES users(id),
  actor_role TEXT,
  from_status TEXT,
  to_status TEXT,
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_capa_records_status
ON capa_records (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_capa_records_source_ncr
ON capa_records (source_ncr_id)
WHERE source_ncr_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_capa_actions_capa
ON capa_actions (capa_id, due_at);
CREATE INDEX IF NOT EXISTS idx_capa_audit_log_capa
ON capa_audit_log (capa_id, created_at DESC);

-- BL-110: Controlled document register
CREATE TABLE IF NOT EXISTS controlled_documents (
  id SERIAL PRIMARY KEY,
  document_number TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  category TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_approval', 'approved', 'obsolete')),
  current_revision_id INTEGER,
  created_by_user_id INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS document_revisions (
  id SERIAL PRIMARY KEY,
  document_id INTEGER NOT NULL REFERENCES controlled_documents(id) ON DELETE CASCADE,
  revision_code TEXT NOT NULL,
  file_name TEXT,
  file_data_base64 TEXT,
  is_obsolete BOOLEAN NOT NULL DEFAULT false,
  created_by_user_id INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (document_id, revision_code)
);

CREATE TABLE IF NOT EXISTS document_approvals (
  id SERIAL PRIMARY KEY,
  document_revision_id INTEGER NOT NULL REFERENCES document_revisions(id) ON DELETE CASCADE,
  approver_user_id INTEGER NOT NULL REFERENCES users(id),
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS document_links (
  id SERIAL PRIMARY KEY,
  document_id INTEGER NOT NULL REFERENCES controlled_documents(id) ON DELETE CASCADE,
  operation_id INTEGER REFERENCES operations(id) ON DELETE CASCADE,
  dimension_id INTEGER REFERENCES dimensions(id) ON DELETE CASCADE,
  created_by_user_id INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (operation_id IS NOT NULL OR dimension_id IS NOT NULL)
);

ALTER TABLE controlled_documents
  DROP CONSTRAINT IF EXISTS fk_controlled_documents_current_revision;
ALTER TABLE controlled_documents
  ADD CONSTRAINT fk_controlled_documents_current_revision
  FOREIGN KEY (current_revision_id) REFERENCES document_revisions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_controlled_documents_status
ON controlled_documents (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_document_revisions_document
ON document_revisions (document_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_document_links_document
ON document_links (document_id);

-- BL-111: Supplier quality baseline
CREATE TABLE IF NOT EXISTS suppliers (
  id SERIAL PRIMARY KEY,
  supplier_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'approved'
    CHECK (status IN ('approved', 'conditional', 'probation', 'disqualified')),
  contact_name TEXT,
  contact_email TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS supplier_items (
  id SERIAL PRIMARY KEY,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  part_id TEXT NOT NULL,
  item_code TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (supplier_id, part_id)
);

CREATE TABLE IF NOT EXISTS incoming_inspections (
  id SERIAL PRIMARY KEY,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  supplier_item_id INTEGER REFERENCES supplier_items(id) ON DELETE SET NULL,
  received_quantity INTEGER NOT NULL CHECK (received_quantity >= 0),
  inspected_quantity INTEGER NOT NULL CHECK (inspected_quantity >= 0),
  accepted_quantity INTEGER NOT NULL CHECK (accepted_quantity >= 0),
  rejected_quantity INTEGER NOT NULL CHECK (rejected_quantity >= 0),
  status TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'inspected', 'accepted', 'rejected')),
  linked_ncr_id INTEGER REFERENCES nonconformances(id) ON DELETE SET NULL,
  inspection_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_user_id INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_suppliers_status
ON suppliers (status, name);
CREATE INDEX IF NOT EXISTS idx_supplier_items_supplier
ON supplier_items (supplier_id, part_id);
CREATE INDEX IF NOT EXISTS idx_incoming_inspections_supplier
ON incoming_inspections (supplier_id, inspection_date DESC);

-- BL-112: Internal audit management
CREATE TABLE IF NOT EXISTS audit_programs (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  scope TEXT,
  cadence TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by_user_id INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_schedules (
  id SERIAL PRIMARY KEY,
  program_id INTEGER NOT NULL REFERENCES audit_programs(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  lead_auditor_user_id INTEGER REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'in_progress', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_checklist_items (
  id SERIAL PRIMARY KEY,
  schedule_id INTEGER NOT NULL REFERENCES audit_schedules(id) ON DELETE CASCADE,
  clause_ref TEXT,
  prompt TEXT NOT NULL,
  result TEXT
    CHECK (result IN ('conforming', 'minor_nc', 'major_nc', 'observation')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_findings (
  id SERIAL PRIMARY KEY,
  schedule_id INTEGER NOT NULL REFERENCES audit_schedules(id) ON DELETE CASCADE,
  checklist_item_id INTEGER REFERENCES audit_checklist_items(id) ON DELETE SET NULL,
  severity TEXT NOT NULL CHECK (severity IN ('minor_nc', 'major_nc', 'observation')),
  description TEXT NOT NULL,
  linked_capa_id INTEGER REFERENCES capa_records(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_reports (
  id SERIAL PRIMARY KEY,
  schedule_id INTEGER NOT NULL REFERENCES audit_schedules(id) ON DELETE CASCADE,
  report_text TEXT NOT NULL,
  generated_by_user_id INTEGER REFERENCES users(id),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_schedules_program
ON audit_schedules (program_id, scheduled_for DESC);
CREATE INDEX IF NOT EXISTS idx_audit_findings_schedule
ON audit_findings (schedule_id, created_at DESC);

-- BL-113: Training and competency
CREATE TABLE IF NOT EXISTS training_courses (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  refresh_interval_days INTEGER CHECK (refresh_interval_days IS NULL OR refresh_interval_days > 0),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS training_records (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id INTEGER NOT NULL REFERENCES training_courses(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ,
  certificate_ref TEXT,
  recorded_by_user_id INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS operation_training_requirements (
  id SERIAL PRIMARY KEY,
  operation_id INTEGER NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
  course_id INTEGER NOT NULL REFERENCES training_courses(id) ON DELETE CASCADE,
  required BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (operation_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_training_records_user
ON training_records (user_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_training_records_course
ON training_records (course_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_operation_training_requirements_operation
ON operation_training_requirements (operation_id);

-- BL-114: Certificate of Conformance
CREATE TABLE IF NOT EXISTS certificates_of_conformance (
  id SERIAL PRIMARY KEY,
  coc_number TEXT NOT NULL UNIQUE,
  record_id INTEGER REFERENCES records(id) ON DELETE SET NULL,
  fai_package_id INTEGER REFERENCES fai_packages(id) ON DELETE SET NULL,
  customer_name TEXT,
  purchase_order TEXT,
  spec_reference TEXT,
  statement_template TEXT NOT NULL,
  statement_rendered TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'void')),
  void_reason TEXT,
  created_by_user_id INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  voided_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_certificates_of_conformance_record
ON certificates_of_conformance (record_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_certificates_of_conformance_status
ON certificates_of_conformance (status, created_at DESC);

-- BL-115: Calibration lab enhancement
CREATE TABLE IF NOT EXISTS calibration_schedules (
  id SERIAL PRIMARY KEY,
  tool_id INTEGER NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
  interval_days INTEGER NOT NULL CHECK (interval_days > 0),
  last_calibrated_at TIMESTAMPTZ,
  next_due_at TIMESTAMPTZ NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tool_id)
);

CREATE TABLE IF NOT EXISTS calibration_events (
  id SERIAL PRIMARY KEY,
  tool_id INTEGER NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
  schedule_id INTEGER REFERENCES calibration_schedules(id) ON DELETE SET NULL,
  performed_at TIMESTAMPTZ NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('pass', 'fail')),
  certificate_name TEXT,
  certificate_data_base64 TEXT,
  notes TEXT,
  created_by_user_id INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS calibration_recall_impacts (
  id SERIAL PRIMARY KEY,
  calibration_event_id INTEGER NOT NULL REFERENCES calibration_events(id) ON DELETE CASCADE,
  record_id INTEGER NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  tool_id INTEGER NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
  flagged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'resolved')),
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_calibration_schedules_due
ON calibration_schedules (next_due_at ASC)
WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_calibration_events_tool
ON calibration_events (tool_id, performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_calibration_recall_impacts_event
ON calibration_recall_impacts (calibration_event_id, flagged_at DESC);

-- BL-116: Report template builder
CREATE TABLE IF NOT EXISTS report_templates (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('job', 'record', 'tool', 'issue', 'user')),
  selected_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  filter_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_config JSONB NOT NULL DEFAULT '[]'::jsonb,
  output_formats JSONB NOT NULL DEFAULT '["csv","pdf","excel"]'::jsonb,
  scope_site_id TEXT NOT NULL DEFAULT 'default',
  created_by_user_id INTEGER REFERENCES users(id),
  updated_by_user_id INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_templates_entity
ON report_templates (entity_type, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_templates_site
ON report_templates (scope_site_id, updated_at DESC);
ALTER TABLE report_templates ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE report_templates ADD COLUMN IF NOT EXISTS updated_by_user_id INTEGER REFERENCES users(id);
ALTER TABLE report_templates ALTER COLUMN output_formats SET DEFAULT '["csv","pdf","excel"]'::jsonb;

-- BL-117: Gauge R&R / MSA baseline
CREATE TABLE IF NOT EXISTS msa_studies (
  id SERIAL PRIMARY KEY,
  tool_id TEXT REFERENCES tools(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'anova' CHECK (method IN ('anova')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'analyzed', 'closed')),
  part_count INTEGER NOT NULL DEFAULT 0 CHECK (part_count >= 0),
  appraiser_count INTEGER NOT NULL DEFAULT 0 CHECK (appraiser_count >= 0),
  trial_count INTEGER NOT NULL DEFAULT 0 CHECK (trial_count >= 0),
  verdict TEXT CHECK (verdict IN ('pass', 'marginal', 'fail')),
  metrics JSONB NOT NULL DEFAULT '{}',
  created_by_user_id INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS msa_observations (
  id SERIAL PRIMARY KEY,
  study_id INTEGER NOT NULL REFERENCES msa_studies(id) ON DELETE CASCADE,
  part_number TEXT NOT NULL,
  appraiser_label TEXT NOT NULL,
  trial_number INTEGER NOT NULL CHECK (trial_number > 0),
  measured_value NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_msa_observations_study
ON msa_observations (study_id, part_number, appraiser_label, trial_number);

-- BL-118: PPAP workflow baseline
CREATE TABLE IF NOT EXISTS ppap_packages (
  id SERIAL PRIMARY KEY,
  part_id TEXT NOT NULL,
  customer_name TEXT,
  submission_level INTEGER NOT NULL CHECK (submission_level BETWEEN 1 AND 5),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_review', 'submitted', 'approved', 'rejected')),
  notes TEXT,
  created_by_user_id INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ppap_elements (
  id SERIAL PRIMARY KEY,
  package_id INTEGER NOT NULL REFERENCES ppap_packages(id) ON DELETE CASCADE,
  element_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'complete', 'waived', 'not_required')),
  notes TEXT,
  attachment_name TEXT,
  attachment_data_base64 TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (package_id, element_code)
);

CREATE TABLE IF NOT EXISTS ppap_customer_approvals (
  id SERIAL PRIMARY KEY,
  package_id INTEGER NOT NULL REFERENCES ppap_packages(id) ON DELETE CASCADE,
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected')),
  customer_reference TEXT,
  notes TEXT,
  decided_by_user_id INTEGER REFERENCES users(id),
  decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ppap_packages_part
ON ppap_packages (part_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ppap_elements_package
ON ppap_elements (package_id, element_code);

-- BL-120: Machine/IoT ingestion baseline (INT-IOT-v1)

CREATE TABLE IF NOT EXISTS collector_configurations (
  id                    SERIAL PRIMARY KEY,
  name                  TEXT NOT NULL UNIQUE,
  source_protocol       TEXT NOT NULL CHECK (source_protocol IN ('opc_ua', 'mqtt', 'tcp')),
  import_type           TEXT NOT NULL DEFAULT 'measurements' CHECK (import_type IN ('measurements')),
  connection_options    JSONB NOT NULL DEFAULT '{}',
  poll_interval_seconds INTEGER CHECK (poll_interval_seconds > 0),
  enabled               BOOLEAN NOT NULL DEFAULT true,
  last_heartbeat_at     TIMESTAMPTZ,
  last_status           TEXT CHECK (last_status IN ('ok', 'error', 'degraded', 'unknown')),
  last_message          TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS collector_tag_mappings (
  id              SERIAL PRIMARY KEY,
  collector_id    INTEGER NOT NULL REFERENCES collector_configurations(id) ON DELETE CASCADE,
  device_id       TEXT NOT NULL,
  tag_address     TEXT NOT NULL,
  dimension_id    INTEGER NOT NULL REFERENCES dimensions(id),
  job_id          TEXT NOT NULL REFERENCES jobs(id),
  piece_number    INTEGER NOT NULL CHECK (piece_number > 0),
  unit_override   TEXT,
  enabled         BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (collector_id, device_id, tag_address)
);

CREATE TABLE IF NOT EXISTS collector_runs (
  id               SERIAL PRIMARY KEY,
  collector_id     INTEGER REFERENCES collector_configurations(id) ON DELETE SET NULL,
  source_protocol  TEXT NOT NULL,
  trigger_mode     TEXT NOT NULL CHECK (trigger_mode IN ('push', 'scheduled', 'manual')),
  status           TEXT NOT NULL CHECK (status IN ('success', 'partial', 'error')),
  total_readings   INTEGER NOT NULL DEFAULT 0,
  inserted_count   INTEGER NOT NULL DEFAULT 0,
  oot_count        INTEGER NOT NULL DEFAULT 0,
  failed_count     INTEGER NOT NULL DEFAULT 0,
  summary          JSONB,
  errors           JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS collector_oot_queue (
  id                      SERIAL PRIMARY KEY,
  run_id                  INTEGER REFERENCES collector_runs(id) ON DELETE SET NULL,
  collector_id            INTEGER REFERENCES collector_configurations(id) ON DELETE SET NULL,
  record_id               INTEGER REFERENCES records(id) ON DELETE SET NULL,
  job_id                  TEXT NOT NULL,
  dimension_id            INTEGER NOT NULL,
  piece_number            INTEGER NOT NULL,
  measured_value          NUMERIC NOT NULL,
  nominal                 NUMERIC,
  tol_plus                NUMERIC,
  tol_minus               NUMERIC,
  unit                    TEXT,
  device_id               TEXT,
  tag_address             TEXT,
  reading_timestamp       TIMESTAMPTZ NOT NULL,
  status                  TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'acknowledged', 'escalated')),
  acknowledged_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  acknowledged_by_role    TEXT,
  acknowledged_at         TIMESTAMPTZ,
  escalated_to_issue_id   INTEGER,
  escalation_note         TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS collector_oot_audit (
  id             SERIAL PRIMARY KEY,
  oot_queue_id   INTEGER NOT NULL REFERENCES collector_oot_queue(id) ON DELETE CASCADE,
  user_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  user_role      TEXT,
  action         TEXT NOT NULL CHECK (action IN ('acknowledged', 'escalated', 'note_added')),
  before_status  TEXT,
  after_status   TEXT,
  note           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_collector_tag_mappings_collector ON collector_tag_mappings(collector_id);
CREATE INDEX IF NOT EXISTS idx_collector_runs_collector ON collector_runs(collector_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_collector_oot_queue_status ON collector_oot_queue(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_collector_oot_queue_job ON collector_oot_queue(job_id);

-- BL-121: No-code inspection form builder (OPS-FORMBUILDER-v1)

CREATE TABLE IF NOT EXISTS inspection_form_templates (
  id                    SERIAL PRIMARY KEY,
  name                  TEXT NOT NULL,
  description           TEXT,
  schema                JSONB NOT NULL DEFAULT '[]',
  status                TEXT NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft', 'published', 'archived')),
  scope_site_id         TEXT NOT NULL DEFAULT 'default',
  created_by_user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (name, scope_site_id)
);

CREATE TABLE IF NOT EXISTS inspection_form_submissions (
  id                    SERIAL PRIMARY KEY,
  form_template_id      INTEGER NOT NULL REFERENCES inspection_form_templates(id) ON DELETE RESTRICT,
  job_id                TEXT REFERENCES jobs(id) ON DELETE SET NULL,
  data                  JSONB NOT NULL DEFAULT '{}',
  submitted_by_user_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  submitted_by_role     TEXT,
  submitted_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scope_site_id         TEXT NOT NULL DEFAULT 'default'
);

CREATE TABLE IF NOT EXISTS inspection_form_audit_log (
  id                    SERIAL PRIMARY KEY,
  form_template_id      INTEGER NOT NULL REFERENCES inspection_form_templates(id) ON DELETE CASCADE,
  user_id               INTEGER REFERENCES users(id) ON DELETE SET NULL,
  user_role             TEXT,
  action                TEXT NOT NULL
                          CHECK (action IN ('created', 'updated', 'published', 'archived', 'submission_created')),
  before_snapshot       JSONB,
  after_snapshot        JSONB,
  note                  TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inspection_form_templates_site
  ON inspection_form_templates (scope_site_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_inspection_form_templates_published
  ON inspection_form_templates (status, updated_at DESC) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_inspection_form_submissions_template
  ON inspection_form_submissions (form_template_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_inspection_form_submissions_job
  ON inspection_form_submissions (job_id, submitted_at DESC) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inspection_form_audit_log_template
  ON inspection_form_audit_log (form_template_id, created_at DESC);

-- BL-122: External customer/supplier portal baseline (COMM-PORTAL-v1)
CREATE TABLE IF NOT EXISTS portal_invitations (
  id SERIAL PRIMARY KEY,
  portal_type TEXT NOT NULL CHECK (portal_type IN ('supplier', 'customer')),
  email TEXT NOT NULL,
  supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  customer_name TEXT,
  invite_token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_by_user_id INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (portal_type = 'supplier' AND supplier_id IS NOT NULL)
    OR
    (portal_type = 'customer' AND customer_name IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS portal_sessions (
  id SERIAL PRIMARY KEY,
  invitation_id INTEGER NOT NULL REFERENCES portal_invitations(id) ON DELETE CASCADE,
  session_token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS portal_capa_responses (
  id SERIAL PRIMARY KEY,
  capa_id INTEGER NOT NULL REFERENCES capa_records(id) ON DELETE CASCADE,
  invitation_id INTEGER NOT NULL REFERENCES portal_invitations(id) ON DELETE CASCADE,
  response_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'updated')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (capa_id, invitation_id)
);

CREATE TABLE IF NOT EXISTS portal_document_access (
  id SERIAL PRIMARY KEY,
  invitation_id INTEGER NOT NULL REFERENCES portal_invitations(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN ('coc', 'ppap', 'psw')),
  document_id INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (invitation_id, document_type, document_id)
);

CREATE INDEX IF NOT EXISTS idx_portal_invitations_email
  ON portal_invitations (LOWER(email), status, expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_invitations_supplier
  ON portal_invitations (supplier_id, status)
  WHERE supplier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_portal_invitations_customer
  ON portal_invitations (LOWER(customer_name), status)
  WHERE customer_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_portal_sessions_invitation
  ON portal_sessions (invitation_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_capa_responses_capa
  ON portal_capa_responses (capa_id, updated_at DESC);
