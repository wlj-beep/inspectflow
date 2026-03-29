# Data Model (Logical)

## Users
- id
- name
- role (Operator | Supervisor | Admin)
- active

## Tools
- id
- name
- type (Variable | Go/No-Go | Attribute)
- itNum

## Parts
- id (part number)
- description

## Operations
- id
- partId
- opNumber
- label

## Dimensions
- id
- operationId
- name
- nominal
- tolPlus
- tolMinus
- unit (in | mm | Ra | deg)
- sampling (first_last | every_5 | every_10 | 100pct)

## DimensionTools (allowed tools)
- dimensionId
- toolId

## Jobs
- id (job number)
- partId
- operationId
- lot
- qty
- status (open | closed | draft | incomplete)
- lockOwnerUserId (nullable)
- lockTimestamp (nullable)

## Records
- id
- jobId
- partId
- operationId
- lot
- qty
- timestamp
- operatorUserId
- status (complete | incomplete)
- oot (bool)
- comment (nullable)

## RecordValues
- recordId
- dimensionId
- pieceNumber
- value (string: numeric or PASS/FAIL)
- isOOT (bool)

## RecordTools
- recordId
- dimensionId
- toolId
- itNum

## MissingPieces
- recordId
- pieceNumber
- reason (Scrapped | Lost | Damaged | Other)
- ncNum (nullable)
- details (nullable)

## AuditLog
- id
- recordId
- userId
- timestamp
- field (dimensionId + pieceNumber)
- beforeValue
- afterValue
- reason

## Schema Coverage Index

Generated from `backend/db/schema.sql`; keep these entries aligned with table creation statements.

## users
- Primary key: `id`
- Required columns: `id`, `name`, `role`, `active`
- Nullable columns: none
- Relationships: none

## user_site_access
- Primary key: `user_id`, `site_id`
- Required columns: `user_id`, `site_id`, `is_default`, `created_at`
- Nullable columns: none
- Relationships: `user_id -> users.id`

## tools
- Primary key: `id`
- Required columns: `id`, `name`, `type`, `it_num`, `active`, `visible`
- Nullable columns: `calibration_due_date`, `current_location_id`, `home_location_id`, `size`
- Relationships: none

## tool_locations
- Primary key: `id`
- Required columns: `id`, `name`, `location_type`
- Nullable columns: none
- Relationships: none

## parts
- Primary key: `id`
- Required columns: `id`, `description`
- Nullable columns: none
- Relationships: none

## part_setup_revisions
- Primary key: `id`
- Required columns: `id`, `part_id`, `revision_code`, `revision_index`, `part_name`, `snapshot`, `change_summary`, `changed_fields`, `created_at`
- Nullable columns: `created_by_role`
- Relationships: `part_id -> parts.id`

## operations
- Primary key: `id`
- Required columns: `id`, `part_id`, `op_number`, `label`
- Nullable columns: none
- Relationships: `part_id -> parts.id`

## operation_instruction_sets
- Primary key: `id`
- Required columns: `id`, `operation_id`, `created_at`, `updated_at`
- Nullable columns: none
- Relationships: `operation_id -> operations.id`

## operation_instruction_versions
- Primary key: `id`
- Required columns: `id`, `instruction_set_id`, `version_number`, `status`, `title`, `content`, `created_at`, `updated_at`
- Nullable columns: `change_summary`, `created_by_user_id`, `created_by_role`, `published_by_user_id`, `published_by_role`, `published_at`
- Relationships: `instruction_set_id -> operation_instruction_sets.id`, `created_by_user_id -> users.id`, `published_by_user_id -> users.id`

## operation_instruction_media_links
- Primary key: `id`
- Required columns: `id`, `instruction_version_id`, `media_type`, `label`, `url`, `sort_order`, `created_at`
- Nullable columns: none
- Relationships: `instruction_version_id -> operation_instruction_versions.id`

## work_centers
- Primary key: `id`
- Required columns: `id`, `code`, `name`, `active`, `created_at`, `updated_at`
- Nullable columns: `description`
- Relationships: none

## work_center_audit_log
- Primary key: `id`
- Required columns: `id`, `action`, `changed_at`
- Nullable columns: `work_center_id`, `operation_id`, `before_value`, `after_value`, `reason`, `changed_by_user_id`, `changed_by_role`
- Relationships: `work_center_id -> work_centers.id`, `operation_id -> operations.id`, `changed_by_user_id -> users.id`

## operation_work_center_history
- Primary key: `id`
- Required columns: `id`, `operation_id`, `part_id`, `reason`, `changed_at`
- Nullable columns: `before_work_center_id`, `after_work_center_id`, `changed_by_user_id`, `changed_by_role`
- Relationships: `operation_id -> operations.id`, `part_id -> parts.id`, `before_work_center_id -> work_centers.id`, `after_work_center_id -> work_centers.id`, `changed_by_user_id -> users.id`

## dimensions
- Primary key: `id`
- Required columns: `id`, `operation_id`, `name`, `feature_modifiers_json`, `nominal`, `tol_plus`, `tol_minus`, `unit`, `sampling`, `input_mode`
- Nullable columns: `bubble_number`, `feature_type`, `gdt_class`, `tolerance_zone`, `feature_quantity`, `feature_units`, `source_characteristic_key`, `sampling_interval`
- Relationships: `operation_id -> operations.id`

## dimension_tools
- Primary key: `dimension_id`, `tool_id`
- Required columns: `dimension_id`, `tool_id`
- Nullable columns: none
- Relationships: `dimension_id -> dimensions.id`, `tool_id -> tools.id`

## characteristic_schema_audit_log
- Primary key: `id`
- Required columns: `id`, `action`, `source`, `created_at`
- Nullable columns: `dimension_id`, `operation_id`, `part_id`, `actor_user_id`, `actor_role`, `reason`, `before_value`, `after_value`
- Relationships: `dimension_id -> dimensions.id`, `operation_id -> operations.id`, `part_id -> parts.id`, `actor_user_id -> users.id`

## jobs
- Primary key: `id`
- Required columns: `id`, `part_id`, `part_revision_code`, `operation_id`, `lot`, `qty`, `status`
- Nullable columns: `lock_owner_user_id`, `lock_timestamp`
- Relationships: `part_id -> parts.id`, `operation_id -> operations.id`, `lock_owner_user_id -> users.id`

## records
- Primary key: `id`
- Required columns: `id`, `job_id`, `part_id`, `operation_id`, `lot`, `qty`, `timestamp`, `operator_user_id`, `status`, `oot`
- Nullable columns: `serial_number`, `comment`, `deleted_at`
- Relationships: `job_id -> jobs.id`, `part_id -> parts.id`, `operation_id -> operations.id`, `operator_user_id -> users.id`

## record_piece_comments
- Primary key: `id`
- Required columns: `id`, `record_id`, `piece_number`, `comment`, `created_at`, `updated_at`
- Nullable columns: `serial_number`, `created_by_user_id`, `created_by_role`
- Relationships: `record_id -> records.id`, `created_by_user_id -> users.id`

## record_piece_comment_audit
- Primary key: `id`
- Required columns: `id`, `record_id`, `piece_number`, `reason`, `timestamp`
- Nullable columns: `piece_comment_id`, `user_id`, `user_role`, `before_comment`, `before_serial_number`, `after_comment`, `after_serial_number`
- Relationships: `piece_comment_id -> record_piece_comments.id`, `record_id -> records.id`, `user_id -> users.id`

## record_attachments
- Primary key: `id`
- Required columns: `id`, `record_id`, `file_name`, `media_type`, `byte_size`, `data_base64`, `retention_until`, `created_at`, `updated_at`
- Nullable columns: `piece_number`, `uploaded_by_user_id`, `uploaded_by_role`, `deleted_at`
- Relationships: `record_id -> records.id`, `uploaded_by_user_id -> users.id`

## fai_packages
- Primary key: `id`
- Required columns: `id`, `context_type`, `part_id`, `lot`, `profile_id`, `status`, `created_at`, `updated_at`
- Nullable columns: `operation_id`, `job_id`, `record_id`, `created_by_user_id`, `created_by_role`, `finalized_by_user_id`, `finalized_by_role`, `finalized_at`
- Relationships: `part_id -> parts.id`, `operation_id -> operations.id`, `job_id -> jobs.id`, `record_id -> records.id`, `created_by_user_id -> users.id`, `finalized_by_user_id -> users.id`

## fai_package_characteristic_signoffs
- Primary key: `id`
- Required columns: `id`, `package_id`, `dimension_id`, `disposition`, `signed_at`, `updated_at`
- Nullable columns: `note`, `signed_by_user_id`, `signed_by_role`
- Relationships: `package_id -> fai_packages.id`, `dimension_id -> dimensions.id`, `signed_by_user_id -> users.id`

## fai_package_status_history
- Primary key: `id`
- Required columns: `id`, `package_id`, `event_type`, `detail_json`, `created_at`
- Nullable columns: `from_status`, `to_status`, `actor_user_id`, `actor_role`
- Relationships: `package_id -> fai_packages.id`, `actor_user_id -> users.id`

## instruction_acknowledgments
- Primary key: `id`
- Required columns: `id`, `instruction_version_id`, `operator_user_id`, `acknowledged_role`, `context_type`, `acknowledged_at`
- Nullable columns: `job_id`, `record_id`
- Relationships: `instruction_version_id -> operation_instruction_versions.id`, `operator_user_id -> users.id`, `job_id -> jobs.id`, `record_id -> records.id`

## job_quantity_adjustments
- Primary key: `id`
- Required columns: `id`, `job_id`, `before_qty`, `after_qty`, `reason`, `actor_user_id`, `created_at`
- Nullable columns: `actor_role`
- Relationships: `job_id -> jobs.id`, `actor_user_id -> users.id`

## record_values
- Primary key: `record_id`, `dimension_id`, `piece_number`
- Required columns: `record_id`, `dimension_id`, `piece_number`, `value`, `is_oot`
- Nullable columns: none
- Relationships: `record_id -> records.id`, `dimension_id -> dimensions.id`

## record_dimension_snapshots
- Primary key: `record_id`, `dimension_id`
- Required columns: `record_id`, `dimension_id`, `name`, `feature_modifiers_json`, `nominal`, `tol_plus`, `tol_minus`, `unit`, `sampling`, `input_mode`
- Nullable columns: `bubble_number`, `feature_type`, `gdt_class`, `tolerance_zone`, `feature_quantity`, `feature_units`, `source_characteristic_key`, `sampling_interval`
- Relationships: `record_id -> records.id`

## record_tools
- Primary key: `record_id`, `dimension_id`, `tool_id`
- Required columns: `record_id`, `dimension_id`, `tool_id`, `it_num`
- Nullable columns: none
- Relationships: `record_id -> records.id`, `dimension_id -> dimensions.id`, `tool_id -> tools.id`

## missing_pieces
- Primary key: `record_id`, `piece_number`
- Required columns: `record_id`, `piece_number`, `reason`
- Nullable columns: `nc_num`, `details`
- Relationships: `record_id -> records.id`

## audit_log
- Primary key: `id`
- Required columns: `id`, `record_id`, `user_id`, `timestamp`, `field`, `reason`
- Nullable columns: `before_value`, `after_value`
- Relationships: `record_id -> records.id`, `user_id -> users.id`

## issue_reports
- Primary key: `id`
- Required columns: `id`, `category`, `details`, `status`, `submitted_by_user_id`, `submitted_by_role`, `submitted_at`
- Nullable columns: `part_id`, `operation_id`, `dimension_id`, `job_id`, `record_id`, `resolved_by_user_id`, `resolved_at`, `resolution_note`
- Relationships: `part_id -> parts.id`, `operation_id -> operations.id`, `dimension_id -> dimensions.id`, `job_id -> jobs.id`, `record_id -> records.id`, `submitted_by_user_id -> users.id`, `resolved_by_user_id -> users.id`

## role_capabilities
- Primary key: `role`, `capability`
- Required columns: `role`, `capability`
- Nullable columns: none
- Relationships: none

## auth_local_credentials
- Primary key: `user_id`
- Required columns: `user_id`, `password_salt`, `password_hash`, `failed_attempts`, `password_updated_at`, `must_rotate_password`
- Nullable columns: `locked_until`
- Relationships: `user_id -> users.id`

## auth_sessions
- Primary key: `id`
- Required columns: `id`, `user_id`, `session_token_hash`, `created_at`, `last_seen_at`, `expires_at`
- Nullable columns: `revoked_at`, `revoked_reason`, `ip_address`, `user_agent`
- Relationships: `user_id -> users.id`

## auth_event_log
- Primary key: `id`
- Required columns: `id`, `event_type`, `metadata`, `created_at`
- Nullable columns: `user_id`, `actor_role`, `session_id`, `username`, `ip_address`, `user_agent`
- Relationships: `user_id -> users.id`, `session_id -> auth_sessions.id`

## platform_entitlements
- Primary key: `id`
- Required columns: `id`, `contract_id`, `license_tier`, `seat_pack`, `seat_soft_limit`, `seat_policy`, `diagnostics_opt_in`, `module_flags`, `module_policy_profile`, `updated_at`
- Nullable columns: `updated_by_user_id`
- Relationships: `updated_by_user_id -> users.id`

## user_sessions
- Primary key: `id`
- Required columns: `id`, `user_id`, `start_ts`
- Nullable columns: `end_ts`
- Relationships: `user_id -> users.id`

## import_integrations
- Primary key: `id`
- Required columns: `id`, `name`, `source_type`, `import_type`, `enabled`, `options`, `created_at`, `updated_at`
- Nullable columns: `endpoint_url`, `auth_header`, `poll_interval_minutes`, `last_run_at`, `last_status`, `last_message`
- Relationships: none

## import_runs
- Primary key: `id`
- Required columns: `id`, `source_type`, `import_type`, `trigger_mode`, `status`, `total_rows`, `inserted_count`, `updated_count`, `failed_count`, `summary`, `errors`, `created_at`
- Nullable columns: `integration_id`
- Relationships: `integration_id -> import_integrations.id`

## import_unresolved_items
- Primary key: `id`
- Required columns: `id`, `source_type`, `import_type`, `reason`, `payload`, `status`, `created_at`
- Nullable columns: `run_id`, `line_number`, `confidence`, `resolved_payload`, `resolved_by_role`, `resolved_at`
- Relationships: `run_id -> import_runs.id`

## import_idempotency_ledger
- Primary key: `id`
- Required columns: `id`, `idempotency_key`, `source_type`, `import_type`, `external_key`, `payload_hash`, `payload_bytes`, `first_seen_at`, `last_seen_at`, `hit_count`
- Nullable columns: `first_run_id`, `last_run_id`, `first_status`, `last_status`
- Relationships: `first_run_id -> import_runs.id`, `last_run_id -> import_runs.id`

## import_external_entity_refs
- Primary key: `id`
- Required columns: `id`, `import_type`, `entity_type`, `external_id`, `source_type`, `latest_internal_ref`, `first_seen_at`, `last_seen_at`, `hit_count`
- Nullable columns: `first_run_id`, `last_run_id`
- Relationships: `first_run_id -> import_runs.id`, `last_run_id -> import_runs.id`

## ana_mart_inspection_fact
- Primary key: `site_id`, `record_id`, `dimension_id`, `piece_number`
- Required columns: `record_id`, `dimension_id`, `piece_number`, `site_id`, `job_id`, `part_id`, `operation_id`, `event_at`, `measurement_count`, `oot_count`, `pass_count`, `rework_count`, `created_at`
- Nullable columns: `lot`, `work_center_id`, `operator_user_id`, `source_run_id`
- Relationships: `record_id -> records.id`, `source_run_id -> import_runs.id`

## ana_mart_connector_run_fact
- Primary key: `site_id`, `run_id`
- Required columns: `run_id`, `site_id`, `connector_id`, `status`, `run_count`, `failure_count`, `replayed_count`, `processed_count`, `created_at`
- Nullable columns: `avg_latency_ms`, `run_ended_at`
- Relationships: `run_id -> import_runs.id`

## ana_mart_job_rollup_day
- Primary key: `site_id`, `rollup_date`, `part_id`, `job_id`
- Required columns: `site_id`, `rollup_date`, `part_id`, `job_id`, `total_pieces`, `pass_pieces`, `oot_pieces`, `correction_events`, `created_at`
- Nullable columns: none
- Relationships: none

## ana_mart_build_runs
- Primary key: `id`
- Required columns: `id`, `site_id`, `trigger_source`, `transform_version`, `status`, `source_snapshot`, `output_snapshot`, `started_at`, `completed_at`, `created_at`
- Nullable columns: `requested_by_role`, `requested_by_user_id`, `error_payload`
- Relationships: `requested_by_user_id -> users.id`

## ana_risk_event_log
- Primary key: `id`
- Required columns: `id`, `dedupe_key`, `contract_id`, `source`, `severity`, `status`, `event_envelope`, `escalation_record`, `context`, `hit_count`, `first_seen_at`, `last_seen_at`, `created_at`, `updated_at`
- Nullable columns: `acknowledged_by_role`, `acknowledged_by_user_id`, `acknowledgement_note`, `acknowledged_at`, `linked_issue_id`, `resolved_by_role`, `resolved_by_user_id`, `resolution_note`, `resolved_at`
- Relationships: `acknowledged_by_user_id -> users.id`, `linked_issue_id -> issue_reports.id`, `resolved_by_user_id -> users.id`

## platform_extensions
- Primary key: `plugin_id`
- Required columns: `plugin_id`, `display_name`, `version`, `sdk_version`, `manifest_json`, `policy_status`, `policy_findings_json`, `enabled`, `required_module`, `created_at`, `updated_at`
- Nullable columns: `updated_by_user_id`, `updated_by_role`
- Relationships: `updated_by_user_id -> users.id`

## partner_connector_kits
- Primary key: `connector_id`
- Required columns: `connector_id`, `display_name`, `version`, `source_types_json`, `import_types_json`, `manifest_json`, `validation_status`, `validation_findings_json`, `enabled`, `created_at`, `updated_at`
- Nullable columns: `sdk_plugin_id`, `updated_by_user_id`, `updated_by_role`
- Relationships: `sdk_plugin_id -> platform_extensions.plugin_id`, `updated_by_user_id -> users.id`

## edge_sync_runs
- Primary key: `id`
- Required columns: `id`, `contract_id`, `direction`, `validation_status`, `payload_summary`, `findings_json`, `created_at`
- Nullable columns: `actor_user_id`, `actor_role`
- Relationships: `actor_user_id -> users.id`

## password_rotation_tokens
- Primary key: `id`
- Required columns: `id`, `user_id`, `token_hash`, `failed_attempts`, `created_at`, `expires_at`
- Nullable columns: `locked_at`, `used_at`
- Relationships: `user_id -> users.id`

## nonconformances
- Primary key: `id`
- Required columns: `id`, `title`, `status`, `created_at`, `updated_at`
- Nullable columns: `description`, `disposition`, `disposition_notes`, `record_id`, `record_value_dimension_id`, `record_value_piece_number`, `part_id`, `job_id`, `created_by_user_id`, `dispositioned_by_user_id`, `closed_by_user_id`, `dispositioned_at`, `closed_at`
- Relationships: `record_id -> records.id`, `created_by_user_id -> users.id`, `dispositioned_by_user_id -> users.id`, `closed_by_user_id -> users.id`

## ncr_audit_log
- Primary key: `id`
- Required columns: `id`, `ncr_id`, `event_type`, `created_at`
- Nullable columns: `actor_user_id`, `actor_role`, `from_status`, `to_status`, `notes`, `metadata`
- Relationships: `ncr_id -> nonconformances.id`, `actor_user_id -> users.id`

## capa_records
- Primary key: `id`
- Required columns: `id`, `title`, `status`, `created_at`, `updated_at`
- Nullable columns: `problem_statement`, `source_ncr_id`, `root_cause_method`, `root_cause_details`, `effectiveness_notes`, `due_at`, `created_by_user_id`, `closed_by_user_id`, `closed_at`
- Relationships: `source_ncr_id -> nonconformances.id`, `created_by_user_id -> users.id`, `closed_by_user_id -> users.id`

## capa_actions
- Primary key: `id`
- Required columns: `id`, `capa_id`, `title`, `status`, `created_at`, `updated_at`
- Nullable columns: `description`, `assignee_user_id`, `due_at`, `completed_at`
- Relationships: `capa_id -> capa_records.id`, `assignee_user_id -> users.id`

## capa_audit_log
- Primary key: `id`
- Required columns: `id`, `capa_id`, `event_type`, `created_at`
- Nullable columns: `actor_user_id`, `actor_role`, `from_status`, `to_status`, `notes`, `metadata`
- Relationships: `capa_id -> capa_records.id`, `actor_user_id -> users.id`

## controlled_documents
- Primary key: `id`
- Required columns: `id`, `document_number`, `title`, `status`, `created_at`, `updated_at`
- Nullable columns: `category`, `current_revision_id`, `created_by_user_id`
- Relationships: `created_by_user_id -> users.id`

## document_revisions
- Primary key: `id`
- Required columns: `id`, `document_id`, `revision_code`, `is_obsolete`, `created_at`
- Nullable columns: `file_name`, `file_data_base64`, `created_by_user_id`
- Relationships: `document_id -> controlled_documents.id`, `created_by_user_id -> users.id`

## document_approvals
- Primary key: `id`
- Required columns: `id`, `document_revision_id`, `approver_user_id`, `decision`, `created_at`
- Nullable columns: `notes`
- Relationships: `document_revision_id -> document_revisions.id`, `approver_user_id -> users.id`

## document_links
- Primary key: `id`
- Required columns: `id`, `document_id`, `created_at`
- Nullable columns: `operation_id`, `dimension_id`, `created_by_user_id`
- Relationships: `document_id -> controlled_documents.id`, `operation_id -> operations.id`, `dimension_id -> dimensions.id`, `created_by_user_id -> users.id`

## suppliers
- Primary key: `id`
- Required columns: `id`, `supplier_code`, `name`, `status`, `created_at`, `updated_at`
- Nullable columns: `contact_name`, `contact_email`, `notes`
- Relationships: none

## supplier_items
- Primary key: `id`
- Required columns: `id`, `supplier_id`, `part_id`, `active`, `created_at`
- Nullable columns: `item_code`
- Relationships: `supplier_id -> suppliers.id`

## incoming_inspections
- Primary key: `id`
- Required columns: `id`, `supplier_id`, `received_quantity`, `inspected_quantity`, `accepted_quantity`, `rejected_quantity`, `status`, `inspection_date`, `created_at`
- Nullable columns: `supplier_item_id`, `linked_ncr_id`, `created_by_user_id`
- Relationships: `supplier_id -> suppliers.id`, `supplier_item_id -> supplier_items.id`, `linked_ncr_id -> nonconformances.id`, `created_by_user_id -> users.id`

## audit_programs
- Primary key: `id`
- Required columns: `id`, `name`, `active`, `created_at`
- Nullable columns: `scope`, `cadence`, `created_by_user_id`
- Relationships: `created_by_user_id -> users.id`

## audit_schedules
- Primary key: `id`
- Required columns: `id`, `program_id`, `title`, `scheduled_for`, `status`, `created_at`
- Nullable columns: `lead_auditor_user_id`
- Relationships: `program_id -> audit_programs.id`, `lead_auditor_user_id -> users.id`

## audit_checklist_items
- Primary key: `id`
- Required columns: `id`, `schedule_id`, `prompt`, `created_at`
- Nullable columns: `clause_ref`, `result`, `notes`
- Relationships: `schedule_id -> audit_schedules.id`

## audit_findings
- Primary key: `id`
- Required columns: `id`, `schedule_id`, `severity`, `description`, `created_at`
- Nullable columns: `checklist_item_id`, `linked_capa_id`
- Relationships: `schedule_id -> audit_schedules.id`, `checklist_item_id -> audit_checklist_items.id`, `linked_capa_id -> capa_records.id`

## audit_reports
- Primary key: `id`
- Required columns: `id`, `schedule_id`, `report_text`, `generated_at`
- Nullable columns: `generated_by_user_id`
- Relationships: `schedule_id -> audit_schedules.id`, `generated_by_user_id -> users.id`

## training_courses
- Primary key: `id`
- Required columns: `id`, `code`, `title`, `active`, `created_at`
- Nullable columns: `refresh_interval_days`
- Relationships: none

## training_records
- Primary key: `id`
- Required columns: `id`, `user_id`, `course_id`, `completed_at`, `created_at`
- Nullable columns: `expires_at`, `certificate_ref`, `recorded_by_user_id`
- Relationships: `user_id -> users.id`, `course_id -> training_courses.id`, `recorded_by_user_id -> users.id`

## operation_training_requirements
- Primary key: `id`
- Required columns: `id`, `operation_id`, `course_id`, `required`, `created_at`
- Nullable columns: none
- Relationships: `operation_id -> operations.id`, `course_id -> training_courses.id`

## certificates_of_conformance
- Primary key: `id`
- Required columns: `id`, `coc_number`, `statement_template`, `statement_rendered`, `status`, `created_at`
- Nullable columns: `record_id`, `fai_package_id`, `customer_name`, `purchase_order`, `spec_reference`, `void_reason`, `created_by_user_id`, `voided_at`
- Relationships: `record_id -> records.id`, `fai_package_id -> fai_packages.id`, `created_by_user_id -> users.id`

## calibration_schedules
- Primary key: `id`
- Required columns: `id`, `tool_id`, `interval_days`, `next_due_at`, `active`, `created_at`, `updated_at`
- Nullable columns: `last_calibrated_at`
- Relationships: `tool_id -> tools.id`

## calibration_events
- Primary key: `id`
- Required columns: `id`, `tool_id`, `performed_at`, `result`, `created_at`
- Nullable columns: `schedule_id`, `certificate_name`, `certificate_data_base64`, `notes`, `created_by_user_id`
- Relationships: `tool_id -> tools.id`, `schedule_id -> calibration_schedules.id`, `created_by_user_id -> users.id`

## calibration_recall_impacts
- Primary key: `id`
- Required columns: `id`, `calibration_event_id`, `record_id`, `tool_id`, `flagged_at`, `status`
- Nullable columns: `notes`
- Relationships: `calibration_event_id -> calibration_events.id`, `record_id -> records.id`, `tool_id -> tools.id`

## report_templates
- Primary key: `id`
- Required columns: `id`, `name`, `entity_type`, `selected_fields`, `filter_config`, `sort_config`, `output_formats`, `scope_site_id`, `created_at`, `updated_at`
- Nullable columns: `description`, `created_by_user_id`, `updated_by_user_id`
- Relationships: `created_by_user_id -> users.id`, `updated_by_user_id -> users.id`

## msa_studies
- Primary key: `id`
- Required columns: `id`, `title`, `method`, `status`, `part_count`, `appraiser_count`, `trial_count`, `metrics`, `created_at`, `updated_at`
- Nullable columns: `tool_id`, `verdict`, `created_by_user_id`
- Relationships: `tool_id -> tools.id`, `created_by_user_id -> users.id`

## msa_observations
- Primary key: `id`
- Required columns: `id`, `study_id`, `part_number`, `appraiser_label`, `trial_number`, `measured_value`, `created_at`
- Nullable columns: none
- Relationships: `study_id -> msa_studies.id`

## ppap_packages
- Primary key: `id`
- Required columns: `id`, `part_id`, `submission_level`, `status`, `created_at`, `updated_at`
- Nullable columns: `customer_name`, `notes`, `created_by_user_id`
- Relationships: `created_by_user_id -> users.id`

## ppap_elements
- Primary key: `id`
- Required columns: `id`, `package_id`, `element_code`, `status`, `created_at`, `updated_at`
- Nullable columns: `notes`, `attachment_name`, `attachment_data_base64`
- Relationships: `package_id -> ppap_packages.id`

## ppap_customer_approvals
- Primary key: `id`
- Required columns: `id`, `package_id`, `decision`, `decided_at`
- Nullable columns: `customer_reference`, `notes`, `decided_by_user_id`
- Relationships: `package_id -> ppap_packages.id`, `decided_by_user_id -> users.id`

## collector_configurations
- Primary key: `id`
- Required columns: `id`, `name`, `source_protocol`, `import_type`, `connection_options`, `enabled`, `created_at`, `updated_at`
- Nullable columns: `poll_interval_seconds`, `last_heartbeat_at`, `last_status`, `last_message`
- Relationships: none

## collector_tag_mappings
- Primary key: `id`
- Required columns: `id`, `collector_id`, `device_id`, `tag_address`, `dimension_id`, `job_id`, `piece_number`, `enabled`, `created_at`
- Nullable columns: `unit_override`
- Relationships: `collector_id -> collector_configurations.id`, `dimension_id -> dimensions.id`, `job_id -> jobs.id`

## collector_runs
- Primary key: `id`
- Required columns: `id`, `source_protocol`, `trigger_mode`, `status`, `total_readings`, `inserted_count`, `oot_count`, `failed_count`, `created_at`
- Nullable columns: `collector_id`, `summary`, `errors`
- Relationships: `collector_id -> collector_configurations.id`

## collector_oot_queue
- Primary key: `id`
- Required columns: `id`, `job_id`, `dimension_id`, `piece_number`, `measured_value`, `reading_timestamp`, `status`, `created_at`
- Nullable columns: `run_id`, `collector_id`, `record_id`, `nominal`, `tol_plus`, `tol_minus`, `unit`, `device_id`, `tag_address`, `acknowledged_by_user_id`, `acknowledged_by_role`, `acknowledged_at`, `escalated_to_issue_id`, `escalation_note`
- Relationships: `run_id -> collector_runs.id`, `collector_id -> collector_configurations.id`, `record_id -> records.id`, `acknowledged_by_user_id -> users.id`

## collector_oot_audit
- Primary key: `id`
- Required columns: `id`, `oot_queue_id`, `action`, `created_at`
- Nullable columns: `user_id`, `user_role`, `before_status`, `after_status`, `note`
- Relationships: `oot_queue_id -> collector_oot_queue.id`, `user_id -> users.id`

## inspection_form_templates
- Primary key: `id`
- Required columns: `id`, `name`, `schema`, `status`, `scope_site_id`, `created_at`, `updated_at`
- Nullable columns: `description`, `created_by_user_id`, `updated_by_user_id`
- Relationships: `created_by_user_id -> users.id`, `updated_by_user_id -> users.id`

## inspection_form_submissions
- Primary key: `id`
- Required columns: `id`, `form_template_id`, `data`, `submitted_at`, `scope_site_id`
- Nullable columns: `job_id`, `submitted_by_user_id`, `submitted_by_role`
- Relationships: `form_template_id -> inspection_form_templates.id`, `job_id -> jobs.id`, `submitted_by_user_id -> users.id`

## inspection_form_audit_log
- Primary key: `id`
- Required columns: `id`, `form_template_id`, `action`, `created_at`
- Nullable columns: `user_id`, `user_role`, `before_snapshot`, `after_snapshot`, `note`
- Relationships: `form_template_id -> inspection_form_templates.id`, `user_id -> users.id`

## portal_invitations
- Primary key: `id`
- Required columns: `id`, `portal_type`, `email`, `invite_token_hash`, `status`, `expires_at`, `created_at`, `updated_at`
- Nullable columns: `supplier_id`, `customer_name`, `accepted_at`, `revoked_at`, `created_by_user_id`
- Relationships: `supplier_id -> suppliers.id`, `created_by_user_id -> users.id`

## portal_sessions
- Primary key: `id`
- Required columns: `id`, `invitation_id`, `session_token_hash`, `expires_at`, `created_at`
- Nullable columns: `revoked_at`, `last_seen_at`
- Relationships: `invitation_id -> portal_invitations.id`

## portal_capa_responses
- Primary key: `id`
- Required columns: `id`, `capa_id`, `invitation_id`, `response_text`, `status`, `created_at`, `updated_at`
- Nullable columns: none
- Relationships: `capa_id -> capa_records.id`, `invitation_id -> portal_invitations.id`

## portal_document_access
- Primary key: `id`
- Required columns: `id`, `invitation_id`, `document_type`, `document_id`, `created_at`
- Nullable columns: none
- Relationships: `invitation_id -> portal_invitations.id`
