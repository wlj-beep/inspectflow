-- Seed placeholder data for local development

-- BL-120: system actor for IoT collector auto-submissions
INSERT INTO users (name, role, active) VALUES ('_iot_system', 'Operator', false)
ON CONFLICT (name) DO NOTHING;

INSERT INTO users (name, role, active) VALUES
  ('J. Morris','Operator',true),
  ('R. Tatum','Operator',true),
  ('Q. Nguyen','Quality',true),
  ('D. Kowalski','Supervisor',true),
  ('S. Patel','Operator',true),
  ('L. Chen','Operator',true),
  ('M. Okafor','Operator',true),
  ('T. Brennan','Operator',true),
  ('A. Vasquez','Operator',true),
  ('S. Admin','Admin',true)
ON CONFLICT DO NOTHING;

INSERT INTO role_capabilities (role, capability) VALUES
  ('Operator','view_operator'),
  ('Operator','submit_records'),
  ('Operator','view_records'),
  ('Operator','acknowledge_instructions'),
  ('Quality','view_admin'),
  ('Quality','view_jobs'),
  ('Quality','view_records'),
  ('Quality','edit_records'),
  ('Supervisor','view_admin'),
  ('Supervisor','view_jobs'),
  ('Supervisor','manage_jobs'),
  ('Supervisor','manage_instructions'),
  ('Supervisor','view_records'),
  ('Supervisor','edit_records'),
  ('Admin','view_admin'),
  ('Admin','view_jobs'),
  ('Admin','manage_jobs'),
  ('Admin','manage_instructions'),
  ('Admin','view_records'),
  ('Admin','edit_records'),
  ('Admin','manage_parts'),
  ('Admin','manage_tools'),
  ('Admin','manage_users'),
  ('Admin','manage_roles')
ON CONFLICT DO NOTHING;

INSERT INTO platform_entitlements
  (id, contract_id, license_tier, seat_pack, seat_soft_limit, seat_policy, diagnostics_opt_in, module_flags, module_policy_profile)
VALUES
  (
    1,
    'PLAT-ENT-v1',
    'core',
    25,
    25,
    '{"mode":"soft","enforced":false,"hardLimit":0,"namedUsers":[],"allowedDevices":[]}'::JSONB,
    false,
    '{"CORE": true, "QUALITY_PRO": false, "INTEGRATION_SUITE": false, "ANALYTICS_SUITE": false, "MULTISITE": false, "EDGE": false}'::JSONB,
    'core_starter'
  )
ON CONFLICT (id) DO UPDATE
SET contract_id = EXCLUDED.contract_id,
    license_tier = EXCLUDED.license_tier,
    seat_pack = EXCLUDED.seat_pack,
    seat_soft_limit = EXCLUDED.seat_soft_limit,
    seat_policy = EXCLUDED.seat_policy,
    diagnostics_opt_in = EXCLUDED.diagnostics_opt_in,
    module_flags = EXCLUDED.module_flags,
    module_policy_profile = EXCLUDED.module_policy_profile,
    updated_at = NOW();

INSERT INTO tools (name, type, it_num, size) VALUES
  ('Outside Micrometer','Variable','IT-0042','0-6 in'),
  ('Vernier Caliper','Variable','IT-0018','0-12 in'),
  ('Bore Gauge','Variable','IT-0031','0.5-1.0 in'),
  ('Inside Micrometer','Variable','IT-0029','0.5-1.0 in'),
  ('Depth Micrometer','Variable','IT-0055','0-6 in'),
  ('Height Gauge','Variable','IT-0011','0-18 in'),
  ('Profilometer','Variable','IT-0063','Ra'),
  ('CMM','Variable','IT-0001','Full'),
  ('Plug Gauge','Go/No-Go','IT-0074','0.625 in'),
  ('Thread Gauge','Go/No-Go','IT-0082','1/2-13'),
  ('Ring Gauge','Go/No-Go','IT-0091','0.500 in'),
  ('Snap Gauge','Go/No-Go','IT-0090','0.250 in'),
  ('Surface Comparator','Attribute','IT-0044','32 Ra'),
  ('Optical Comparator','Attribute','IT-0038','10x')
ON CONFLICT DO NOTHING;

INSERT INTO tool_locations (name, location_type) VALUES
  ('Machine Cell A','machine'),
  ('Machine Cell B','machine'),
  ('QC Lab Crib','machine'),
  ('Vendor: CalLab','vendor'),
  ('Out for Calibration','out_for_calibration'),
  ('User: J. Morris','user'),
  ('Job: J-10042','job')
ON CONFLICT DO NOTHING;

UPDATE tools
SET
  calibration_due_date = '2026-06-30',
  home_location_id = (SELECT id FROM tool_locations WHERE name='QC Lab Crib'),
  current_location_id = (SELECT id FROM tool_locations WHERE name='Machine Cell A')
WHERE name IN ('Outside Micrometer','Vernier Caliper','Bore Gauge');

INSERT INTO parts (id, description) VALUES
  ('1234','Hydraulic Cylinder Body')
ON CONFLICT DO NOTHING;

INSERT INTO operations (part_id, op_number, label) VALUES
  ('1234','10','Rough Turn'),
  ('1234','20','Bore & Finish'),
  ('1234','30','Thread & Final')
ON CONFLICT DO NOTHING;

INSERT INTO work_centers (code, name, description, active) VALUES
  ('WC-100','Turning Cell','Primary turning operations',true),
  ('WC-200','Bore Cell','Bore and finish operations',true),
  ('WC-300','Thread Cell','Thread/final operations',true)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    active = EXCLUDED.active,
    updated_at = NOW();

UPDATE operations
SET work_center_id = (
  SELECT id FROM work_centers WHERE code = CASE operations.op_number
    WHEN '10' THEN 'WC-100'
    WHEN '20' THEN 'WC-200'
    WHEN '30' THEN 'WC-300'
    ELSE NULL
  END
)
WHERE part_id='1234';

-- Dimensions
INSERT INTO dimensions (operation_id, name, nominal, tol_plus, tol_minus, unit, sampling)
SELECT o.id, 'Outer Diameter', 1.0000, 0.0050, 0.0050, 'in', 'first_last'
FROM operations o WHERE o.part_id='1234' AND o.op_number='10'
ON CONFLICT DO NOTHING;

INSERT INTO dimensions (operation_id, name, nominal, tol_plus, tol_minus, unit, sampling)
SELECT o.id, 'Overall Length', 2.5000, 0.0100, 0.0100, 'in', 'first_last'
FROM operations o WHERE o.part_id='1234' AND o.op_number='10'
ON CONFLICT DO NOTHING;

INSERT INTO dimensions (operation_id, name, nominal, tol_plus, tol_minus, unit, sampling)
SELECT o.id, 'Bore Diameter', 0.6250, 0.0030, 0.0000, 'in', '100pct'
FROM operations o WHERE o.part_id='1234' AND o.op_number='20'
ON CONFLICT DO NOTHING;

INSERT INTO dimensions (operation_id, name, nominal, tol_plus, tol_minus, unit, sampling)
SELECT o.id, 'Surface Finish', 32.0, 8.0, 8.0, 'Ra', 'first_last'
FROM operations o WHERE o.part_id='1234' AND o.op_number='20'
ON CONFLICT DO NOTHING;

INSERT INTO dimensions (operation_id, name, nominal, tol_plus, tol_minus, unit, sampling)
SELECT o.id, 'Thread Pitch Dia', 0.5000, 0.0020, 0.0020, 'in', '100pct'
FROM operations o WHERE o.part_id='1234' AND o.op_number='30'
ON CONFLICT DO NOTHING;

INSERT INTO dimensions (operation_id, name, nominal, tol_plus, tol_minus, unit, sampling)
SELECT o.id, 'Chamfer Depth', 0.0620, 0.0050, 0.0050, 'in', 'first_last'
FROM operations o WHERE o.part_id='1234' AND o.op_number='30'
ON CONFLICT DO NOTHING;

-- Dimension tools (by name lookup)
INSERT INTO dimension_tools (dimension_id, tool_id)
SELECT d.id, t.id
FROM dimensions d
JOIN tools t ON t.name IN ('Outside Micrometer','Vernier Caliper','CMM')
WHERE d.name='Outer Diameter'
ON CONFLICT DO NOTHING;

INSERT INTO dimension_tools (dimension_id, tool_id)
SELECT d.id, t.id
FROM dimensions d
JOIN tools t ON t.name IN ('Vernier Caliper','Height Gauge')
WHERE d.name='Overall Length'
ON CONFLICT DO NOTHING;

INSERT INTO dimension_tools (dimension_id, tool_id)
SELECT d.id, t.id
FROM dimensions d
JOIN tools t ON t.name IN ('Bore Gauge','Inside Micrometer','Plug Gauge','CMM')
WHERE d.name='Bore Diameter'
ON CONFLICT DO NOTHING;

INSERT INTO dimension_tools (dimension_id, tool_id)
SELECT d.id, t.id
FROM dimensions d
JOIN tools t ON t.name IN ('Profilometer','Surface Comparator')
WHERE d.name='Surface Finish'
ON CONFLICT DO NOTHING;

INSERT INTO dimension_tools (dimension_id, tool_id)
SELECT d.id, t.id
FROM dimensions d
JOIN tools t ON t.name IN ('Thread Gauge','CMM','Optical Comparator')
WHERE d.name='Thread Pitch Dia'
ON CONFLICT DO NOTHING;

INSERT INTO dimension_tools (dimension_id, tool_id)
SELECT d.id, t.id
FROM dimensions d
JOIN tools t ON t.name IN ('Depth Micrometer','Vernier Caliper')
WHERE d.name='Chamfer Depth'
ON CONFLICT DO NOTHING;

-- Jobs
INSERT INTO jobs (id, part_id, operation_id, lot, qty, status)
SELECT 'J-10041','1234', o.id, 'Lot A', 8, 'closed' FROM operations o WHERE o.part_id='1234' AND o.op_number='10'
ON CONFLICT DO NOTHING;

INSERT INTO jobs (id, part_id, operation_id, lot, qty, status)
SELECT 'J-10042','1234', o.id, 'Lot A', 12, 'open' FROM operations o WHERE o.part_id='1234' AND o.op_number='20'
ON CONFLICT DO NOTHING;

INSERT INTO jobs (id, part_id, operation_id, lot, qty, status)
SELECT 'J-10043','1234', o.id, 'Lot A', 12, 'open' FROM operations o WHERE o.part_id='1234' AND o.op_number='30'
ON CONFLICT DO NOTHING;

INSERT INTO jobs (id, part_id, operation_id, lot, qty, status)
SELECT 'J-10044','1234', o.id, 'Lot B', 5, 'draft' FROM operations o WHERE o.part_id='1234' AND o.op_number='10'
ON CONFLICT DO NOTHING;
