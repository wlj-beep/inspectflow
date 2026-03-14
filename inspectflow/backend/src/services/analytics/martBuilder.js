import { query, transaction } from "../../db.js";
import { ANA_MART_CONTRACT_ID } from "./anaV3Vocabulary.js";

const MART_BUILD_TRANSFORM_VERSION = `${ANA_MART_CONTRACT_ID}-transform-v1`;
const DEFAULT_SITE_ID = "default";

function toPositiveInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function safeText(value, fallback = "manual") {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, 120) : fallback;
}

async function computeSourceSnapshot(client) {
  const inspectionRowsRes = await client.query(
    "SELECT COUNT(*)::INT AS count FROM record_values"
  );
  const recordsRes = await client.query(
    "SELECT COUNT(*)::INT AS count FROM records"
  );
  const connectorRunsRes = await client.query(
    "SELECT COUNT(*)::INT AS count FROM import_runs"
  );
  const idempotencyRes = await client.query(
    "SELECT COUNT(*)::INT AS count FROM import_idempotency_ledger"
  );
  const externalRefRes = await client.query(
    "SELECT COUNT(*)::INT AS count FROM import_external_entity_refs"
  );
  const correctionRes = await client.query(
    `SELECT COUNT(*)::INT AS count
     FROM audit_log
     WHERE field ~ '^dim:[0-9]+\\|piece:[0-9]+$'`
  );

  return {
    records: Number(recordsRes.rows[0]?.count || 0),
    measurementRows: Number(inspectionRowsRes.rows[0]?.count || 0),
    connectorRuns: Number(connectorRunsRes.rows[0]?.count || 0),
    idempotencyEntries: Number(idempotencyRes.rows[0]?.count || 0),
    externalEntityRefs: Number(externalRefRes.rows[0]?.count || 0),
    correctionEvents: Number(correctionRes.rows[0]?.count || 0)
  };
}

async function refreshInspectionMart(client) {
  const res = await client.query(
    `WITH correction_events AS (
       SELECT
         record_id,
         CAST(split_part(split_part(field, '|', 1), ':', 2) AS INTEGER) AS dimension_id,
         CAST(split_part(split_part(field, '|', 2), ':', 2) AS INTEGER) AS piece_number
       FROM audit_log
       WHERE field ~ '^dim:[0-9]+\\|piece:[0-9]+$'
     ),
     correction_counts AS (
       SELECT
         record_id,
         dimension_id,
         piece_number,
         COUNT(*)::INT AS correction_events
       FROM correction_events
       GROUP BY record_id, dimension_id, piece_number
     ),
     source_run_mapping AS (
       SELECT
         ier.last_run_id AS source_run_id,
         ier.latest_internal_ref->>'jobId' AS job_id,
         ier.latest_internal_ref->>'operationRef' AS operation_ref,
         ier.latest_internal_ref->>'dimensionName' AS dimension_name,
         NULLIF(ier.latest_internal_ref->>'pieceNumber', '')::INTEGER AS piece_number
       FROM import_external_entity_refs ier
       WHERE ier.import_type='measurements'
         AND ier.last_run_id IS NOT NULL
     )
     INSERT INTO ana_mart_inspection_fact (
       record_id,
       dimension_id,
       piece_number,
       site_id,
       job_id,
       part_id,
       operation_id,
       lot,
       work_center_id,
       operator_user_id,
       event_at,
       measurement_count,
       oot_count,
       pass_count,
       rework_count,
       source_run_id
     )
     SELECT
       rv.record_id,
       rv.dimension_id,
       rv.piece_number,
       $1 AS site_id,
       r.job_id,
       r.part_id,
       r.operation_id::TEXT AS operation_id,
       r.lot,
       o.work_center_id::TEXT AS work_center_id,
       r.operator_user_id,
       r.timestamp AS event_at,
       1 AS measurement_count,
       CASE WHEN rv.is_oot THEN 1 ELSE 0 END AS oot_count,
       CASE WHEN rv.is_oot THEN 0 ELSE 1 END AS pass_count,
       COALESCE(cc.correction_events, 0) AS rework_count,
       srm.source_run_id
     FROM record_values rv
     JOIN records r ON r.id=rv.record_id
     JOIN operations o ON o.id=r.operation_id
     LEFT JOIN record_dimension_snapshots rds
       ON rds.record_id=r.id AND rds.dimension_id=rv.dimension_id
     LEFT JOIN dimensions d ON d.id=rv.dimension_id
     LEFT JOIN correction_counts cc
       ON cc.record_id=rv.record_id
      AND cc.dimension_id=rv.dimension_id
      AND cc.piece_number=rv.piece_number
     LEFT JOIN source_run_mapping srm
       ON srm.job_id=r.job_id
      AND srm.piece_number=rv.piece_number
      AND (srm.dimension_name IS NULL OR srm.dimension_name='' OR srm.dimension_name=COALESCE(rds.name, d.name))
      AND (
        srm.operation_ref IS NULL OR srm.operation_ref=''
        OR srm.operation_ref=o.op_number
        OR LPAD(REGEXP_REPLACE(srm.operation_ref, '[^0-9]', '', 'g'), 3, '0')=o.op_number
      )`,
    [DEFAULT_SITE_ID]
  );
  return Number(res.rowCount || 0);
}

async function refreshConnectorRunMart(client) {
  const res = await client.query(
    `INSERT INTO ana_mart_connector_run_fact (
       run_id,
       site_id,
       connector_id,
       status,
       run_count,
       failure_count,
       replayed_count,
       processed_count,
       avg_latency_ms,
       run_ended_at
     )
     SELECT
       ir.id AS run_id,
       $1 AS site_id,
       CASE
         WHEN ir.integration_id IS NOT NULL THEN 'integration:' || ir.integration_id::TEXT
         ELSE 'source:' || ir.source_type
       END AS connector_id,
       ir.status,
       1 AS run_count,
       CASE WHEN ir.status='error' THEN 1 ELSE 0 END AS failure_count,
       CASE
         WHEN COALESCE((ir.summary->'runtime'->>'duplicate')::BOOLEAN, false) THEN 1
         ELSE 0
       END AS replayed_count,
       (COALESCE(ir.inserted_count, 0) + COALESCE(ir.updated_count, 0) + COALESCE(ir.failed_count, 0))::INT AS processed_count,
       (
         SELECT ROUND(AVG((attempt->>'durationMs')::NUMERIC))::INT
         FROM jsonb_array_elements(COALESCE(ir.summary->'runtime'->'attempts', '[]'::JSONB)) attempt
         WHERE (attempt->>'durationMs') ~ '^[0-9]+$'
       ) AS avg_latency_ms,
       ir.created_at AS run_ended_at
     FROM import_runs ir`,
    [DEFAULT_SITE_ID]
  );
  return Number(res.rowCount || 0);
}

async function refreshJobRollupMart(client) {
  const res = await client.query(
    `INSERT INTO ana_mart_job_rollup_day (
       site_id,
       rollup_date,
       part_id,
       job_id,
       total_pieces,
       pass_pieces,
       oot_pieces,
       correction_events
     )
     SELECT
       site_id,
       (event_at AT TIME ZONE 'UTC')::DATE AS rollup_date,
       part_id,
       job_id,
       SUM(measurement_count)::INT AS total_pieces,
       SUM(pass_count)::INT AS pass_pieces,
       SUM(oot_count)::INT AS oot_pieces,
       SUM(rework_count)::INT AS correction_events
     FROM ana_mart_inspection_fact
     GROUP BY site_id, (event_at AT TIME ZONE 'UTC')::DATE, part_id, job_id`
  );
  return Number(res.rowCount || 0);
}

async function snapshotMartTable(client, tableName, orderBy, keyColumns) {
  const countRes = await client.query(
    `SELECT COUNT(*)::INT AS count FROM ${tableName}`
  );
  const fingerprintRes = await client.query(
    `SELECT MD5(COALESCE(string_agg(row_payload, '||' ORDER BY row_ordinal), '')) AS fingerprint
     FROM (
       SELECT
         ROW_NUMBER() OVER (ORDER BY ${orderBy}) AS row_ordinal,
         CONCAT_WS('|', ${keyColumns}) AS row_payload
       FROM ${tableName}
     ) rows`
  );
  return {
    rows: Number(countRes.rows[0]?.count || 0),
    fingerprint: String(fingerprintRes.rows[0]?.fingerprint || "")
  };
}

async function snapshotOutput(client) {
  const inspection = await snapshotMartTable(
    client,
    "ana_mart_inspection_fact",
    "record_id, dimension_id, piece_number",
    "record_id::TEXT, dimension_id::TEXT, piece_number::TEXT, job_id, part_id, operation_id, event_at::TEXT, measurement_count::TEXT, oot_count::TEXT, pass_count::TEXT, rework_count::TEXT, COALESCE(source_run_id::TEXT, '')"
  );
  const connectorRuns = await snapshotMartTable(
    client,
    "ana_mart_connector_run_fact",
    "run_id",
    "run_id::TEXT, connector_id, status, run_count::TEXT, failure_count::TEXT, replayed_count::TEXT, processed_count::TEXT, COALESCE(avg_latency_ms::TEXT, ''), COALESCE(run_ended_at::TEXT, '')"
  );
  const jobRollups = await snapshotMartTable(
    client,
    "ana_mart_job_rollup_day",
    "site_id, rollup_date, part_id, job_id",
    "site_id, rollup_date::TEXT, part_id, job_id, total_pieces::TEXT, pass_pieces::TEXT, oot_pieces::TEXT, correction_events::TEXT"
  );
  return { inspection, connectorRuns, jobRollups };
}

export async function getAnalyticsMartStatus() {
  const latestBuildRes = await query(
    `SELECT id, trigger_source, requested_by_role, requested_by_user_id,
            transform_version, status, source_snapshot, output_snapshot,
            error_payload, started_at, completed_at, created_at
     FROM ana_mart_build_runs
     ORDER BY id DESC
     LIMIT 1`
  );

  const countsRes = await Promise.all([
    query("SELECT COUNT(*)::INT AS count FROM ana_mart_inspection_fact"),
    query("SELECT COUNT(*)::INT AS count FROM ana_mart_connector_run_fact"),
    query("SELECT COUNT(*)::INT AS count FROM ana_mart_job_rollup_day")
  ]);

  return {
    transformVersion: MART_BUILD_TRANSFORM_VERSION,
    latestBuild: latestBuildRes.rows[0] || null,
    martCounts: {
      inspectionEvents: Number(countsRes[0].rows[0]?.count || 0),
      connectorRuns: Number(countsRes[1].rows[0]?.count || 0),
      jobRollups: Number(countsRes[2].rows[0]?.count || 0)
    }
  };
}

export async function rebuildAnalyticsMarts({
  triggerSource = "manual",
  requestedByRole = "system",
  requestedByUserId = null
} = {}) {
  const startedAt = new Date();
  const safeRole = safeText(requestedByRole, "system");
  const safeSource = safeText(triggerSource, "manual");
  const safeUserId = toPositiveInt(requestedByUserId);

  try {
    const result = await transaction(async (client) => {
      // Keep a consistent read snapshot for source counting + fact rebuild.
      await client.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
      const sourceSnapshot = await computeSourceSnapshot(client);

      await client.query("TRUNCATE TABLE ana_mart_job_rollup_day, ana_mart_inspection_fact, ana_mart_connector_run_fact");

      const insertedInspectionRows = await refreshInspectionMart(client);
      const insertedConnectorRows = await refreshConnectorRunMart(client);
      const insertedRollupRows = await refreshJobRollupMart(client);
      const outputSnapshot = await snapshotOutput(client);

      const buildRes = await client.query(
        `INSERT INTO ana_mart_build_runs
           (trigger_source, requested_by_role, requested_by_user_id, transform_version, status, source_snapshot, output_snapshot, started_at, completed_at)
         VALUES ($1,$2,$3,$4,'success',$5,$6,$7,NOW())
         RETURNING id, created_at, completed_at`,
        [
          safeSource,
          safeRole,
          safeUserId,
          MART_BUILD_TRANSFORM_VERSION,
          sourceSnapshot,
          outputSnapshot,
          startedAt.toISOString()
        ]
      );

      return {
        buildId: Number(buildRes.rows[0]?.id || 0),
        createdAt: buildRes.rows[0]?.created_at || startedAt.toISOString(),
        completedAt: buildRes.rows[0]?.completed_at || new Date().toISOString(),
        sourceSnapshot,
        outputSnapshot,
        insertedRows: {
          inspection: insertedInspectionRows,
          connectorRuns: insertedConnectorRows,
          jobRollups: insertedRollupRows
        }
      };
    });

    return {
      ok: true,
      status: "success",
      transformVersion: MART_BUILD_TRANSFORM_VERSION,
      ...result
    };
  } catch (error) {
    const errorPayload = {
      code: "mart_build_error",
      message: String(error?.message || "mart_build_error")
    };
    const failureRes = await query(
      `INSERT INTO ana_mart_build_runs
         (trigger_source, requested_by_role, requested_by_user_id, transform_version, status, source_snapshot, output_snapshot, error_payload, started_at, completed_at)
       VALUES ($1,$2,$3,$4,'error',$5,$6,$7,$8,NOW())
       RETURNING id, created_at, completed_at`,
      [
        safeSource,
        safeRole,
        safeUserId,
        MART_BUILD_TRANSFORM_VERSION,
        {},
        {},
        errorPayload,
        startedAt.toISOString()
      ]
    );

    return {
      ok: false,
      status: "error",
      transformVersion: MART_BUILD_TRANSFORM_VERSION,
      buildId: Number(failureRes.rows[0]?.id || 0),
      createdAt: failureRes.rows[0]?.created_at || startedAt.toISOString(),
      completedAt: failureRes.rows[0]?.completed_at || new Date().toISOString(),
      error: errorPayload
    };
  }
}
