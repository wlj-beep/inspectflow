-- InspectFlow MVP schema (logical first pass)

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('Operator','Quality','Supervisor','Admin')),
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS tools (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('Variable','Go/No-Go','Attribute')),
  it_num TEXT NOT NULL,
  size TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  visible BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS parts (
  id TEXT PRIMARY KEY,
  description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS operations (
  id SERIAL PRIMARY KEY,
  part_id TEXT NOT NULL REFERENCES parts(id),
  op_number TEXT NOT NULL,
  label TEXT NOT NULL,
  UNIQUE (part_id, op_number)
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
  qty INTEGER NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  operator_user_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL CHECK (status IN ('complete','incomplete')),
  oot BOOLEAN NOT NULL DEFAULT FALSE,
  comment TEXT
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
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('Operator','Quality','Supervisor','Admin'));

CREATE TABLE IF NOT EXISTS role_capabilities (
  role TEXT NOT NULL CHECK (role IN ('Operator','Quality','Supervisor','Admin')),
  capability TEXT NOT NULL,
  PRIMARY KEY (role, capability)
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  start_ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_ts TIMESTAMPTZ
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
