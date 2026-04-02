import crypto from "node:crypto";
import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../src/index.js";
import { query } from "../src/db.js";

function randomSuffix() {
  return crypto.randomUUID().slice(0, 6).toUpperCase();
}

async function fetchModuleFlags() {
  const { rows } = await query(
    "SELECT module_flags FROM platform_entitlements WHERE id=1"
  );
  return rows[0]?.module_flags || {};
}

async function updateModuleFlags(flags) {
  await query(
    "UPDATE platform_entitlements SET module_flags=$1::jsonb WHERE id=1",
    [JSON.stringify(flags)]
  );
}

async function getSeedJob() {
  const { rows } = await query(
    "SELECT id, part_id, operation_id, lot FROM jobs ORDER BY id ASC LIMIT 1"
  );
  return rows[0] || null;
}

async function getOperatorUserId() {
  const { rows } = await query(
    "SELECT id FROM users WHERE role='Operator' ORDER BY id ASC LIMIT 1"
  );
  return rows[0]?.id || null;
}

async function getSecondOperatorUserId(excludedUserId) {
  const { rows } = await query(
    "SELECT id FROM users WHERE role='Operator' AND id <> $1 ORDER BY id ASC LIMIT 1",
    [excludedUserId]
  );
  return rows[0]?.id || null;
}

async function createImportRun({ sourceType, importType, triggerMode, status, suffix }) {
  const { rows } = await query(
    `INSERT INTO import_runs
       (integration_id, source_type, import_type, trigger_mode, status,
        total_rows, inserted_count, updated_count, failed_count, summary, errors, created_at)
     VALUES (NULL, $1, $2, $3, $4, 1, 1, 0, 0, $5::jsonb, '[]'::jsonb, NOW())
     RETURNING id`,
    [
      sourceType,
      importType,
      triggerMode,
      status,
      JSON.stringify({ note: `multisite-seed-${suffix}` })
    ]
  );
  return Number(rows[0]?.id || 0);
}

async function createRecord({ job, operatorUserId }) {
  const { rows } = await query(
    `INSERT INTO records
       (job_id, part_id, operation_id, lot, qty, timestamp, operator_user_id, status, oot, comment)
     VALUES ($1,$2,$3,$4,1,NOW(),$5,'complete',false,'multisite seed')
     RETURNING id`,
    [job.id, job.part_id, job.operation_id, job.lot, operatorUserId]
  );
  return Number(rows[0]?.id || 0);
}

async function insertInspectionFact({
  recordId,
  job,
  operatorUserId,
  siteId,
  sourceRunId,
  measurementCount,
  passCount,
  ootCount,
  reworkCount,
  workCenterId = null
}) {
  await query(
    `INSERT INTO ana_mart_inspection_fact
       (record_id, dimension_id, piece_number, site_id, job_id, part_id, operation_id, lot,
        work_center_id, operator_user_id, event_at, measurement_count, oot_count, pass_count, rework_count, source_run_id)
     VALUES ($1,1,1,$2,$3,$4,$5,$6,$7,$8,NOW(),$9,$10,$11,$12,$13)`,
    [
      recordId,
      siteId,
      job.id,
      job.part_id,
      String(job.operation_id),
      job.lot,
      workCenterId,
      operatorUserId,
      measurementCount,
      ootCount,
      passCount,
      reworkCount,
      sourceRunId
    ]
  );
}

async function insertConnectorFact({
  runId,
  siteId,
  runCount,
  failureCount,
  replayedCount,
  processedCount
}) {
  await query(
    `INSERT INTO ana_mart_connector_run_fact
       (run_id, site_id, connector_id, status, run_count, failure_count, replayed_count,
        processed_count, avg_latency_ms, run_ended_at)
     VALUES ($1,$2,$3,'success',$4,$5,$6,$7,120,NOW())`,
    [
      runId,
      siteId,
      `connector-${siteId}`,
      runCount,
      failureCount,
      replayedCount,
      processedCount
    ]
  );
}

async function cleanupSeededData(recordIds, runIds) {
  if (recordIds.length) {
    await query("DELETE FROM ana_mart_inspection_fact WHERE record_id = ANY($1)", [recordIds]);
    await query("DELETE FROM records WHERE id = ANY($1)", [recordIds]);
  }
  if (runIds.length) {
    await query("DELETE FROM ana_mart_connector_run_fact WHERE run_id = ANY($1)", [runIds]);
    await query("DELETE FROM import_runs WHERE id = ANY($1)", [runIds]);
  }
}

describe("analytics KPI multisite boundaries (BL-043)", () => {
  it("rejects non-default site when multisite is disabled", async () => {
    const res = await request(app)
      .get("/api/analytics/kpis/dashboard")
      .query({ siteId: "north" })
      .set("x-user-role", "Admin");

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: "multisite_not_enabled" });
  });

  it("scopes KPI dashboard to the requested site when multisite is enabled", async () => {
    const previousFlags = await fetchModuleFlags();
    const updatedFlags = { ...previousFlags, MULTISITE: true, ANALYTICS_SUITE: true };
    await updateModuleFlags(updatedFlags);

    const recordIds = [];
    const runIds = [];
    try {
      const job = await getSeedJob();
      const operatorUserId = await getOperatorUserId();
      const secondOperatorUserId = await getSecondOperatorUserId(operatorUserId);
      expect(job).toBeTruthy();
      expect(operatorUserId).toBeTruthy();
      expect(secondOperatorUserId).toBeTruthy();

      const suffix = randomSuffix();
      const siteDefault = `default-${suffix.toLowerCase()}`;
      const siteNorth = `north-${suffix.toLowerCase()}`;
      const runDefault = await createImportRun({
        sourceType: "api_pull",
        importType: "jobs",
        triggerMode: "manual",
        status: "success",
        suffix: `${suffix}-default`
      });
      const runNorth = await createImportRun({
        sourceType: "api_pull",
        importType: "jobs",
        triggerMode: "manual",
        status: "success",
        suffix: `${suffix}-north`
      });
      runIds.push(runDefault, runNorth);

      const recordDefault = await createRecord({ job, operatorUserId });
      const recordNorth = await createRecord({ job, operatorUserId });
      recordIds.push(recordDefault, recordNorth);

      await insertInspectionFact({
        recordId: recordDefault,
        job,
        operatorUserId,
        siteId: siteDefault,
        sourceRunId: runDefault,
        measurementCount: 12,
        passCount: 10,
        ootCount: 2,
        reworkCount: 1,
        workCenterId: `wc-default-${suffix.toLowerCase()}`
      });
      await insertInspectionFact({
        recordId: recordNorth,
        job,
        operatorUserId: secondOperatorUserId,
        siteId: siteNorth,
        sourceRunId: runNorth,
        measurementCount: 4,
        passCount: 3,
        ootCount: 1,
        reworkCount: 0,
        workCenterId: `wc-north-${suffix.toLowerCase()}`
      });

      await insertConnectorFact({
        runId: runDefault,
        siteId: siteDefault,
        runCount: 5,
        failureCount: 1,
        replayedCount: 1,
        processedCount: 12
      });
      await insertConnectorFact({
        runId: runNorth,
        siteId: siteNorth,
        runCount: 2,
        failureCount: 0,
        replayedCount: 0,
        processedCount: 4
      });

      const defaultRes = await request(app)
        .get("/api/analytics/kpis/dashboard")
        .query({ siteId: siteDefault })
        .set("x-user-role", "Admin");

      expect(defaultRes.status).toBe(200);
      expect(defaultRes.body.siteId).toBe(siteDefault);
      expect(defaultRes.body.metrics).toMatchObject({
        total_pieces: 12,
        pass_pieces: 10,
        oot_pieces: 2,
        correction_events: 1,
        connector_total_runs: 5,
        connector_failed_runs: 1,
        connector_replayed_runs: 1
      });
      expect(defaultRes.body.breakdowns.byWorkCenter).toHaveLength(1);
      expect(defaultRes.body.breakdowns.byWorkCenter[0]).toMatchObject({
        workCenterId: `wc-default-${suffix.toLowerCase()}`
      });
      expect(defaultRes.body.breakdowns.byOperator).toHaveLength(1);
      expect(defaultRes.body.breakdowns.byOperator[0]).toMatchObject({
        operatorUserId
      });
      expect(defaultRes.body.breakdowns.dailyTrend).toHaveLength(1);
      expect(defaultRes.body.breakdowns.dailyTrend[0].metrics).toMatchObject({
        total_pieces: 12,
        connector_total_runs: 5
      });

      const northRes = await request(app)
        .get("/api/analytics/kpis/dashboard")
        .query({ siteId: siteNorth })
        .set("x-user-role", "Admin");

      expect(northRes.status).toBe(200);
      expect(northRes.body.siteId).toBe(siteNorth);
      expect(northRes.body.metrics).toMatchObject({
        total_pieces: 4,
        pass_pieces: 3,
        oot_pieces: 1,
        correction_events: 0,
        connector_total_runs: 2,
        connector_failed_runs: 0,
        connector_replayed_runs: 0
      });
      expect(northRes.body.breakdowns.byWorkCenter).toHaveLength(1);
      expect(northRes.body.breakdowns.byWorkCenter[0]).toMatchObject({
        workCenterId: `wc-north-${suffix.toLowerCase()}`
      });
      expect(northRes.body.breakdowns.byOperator).toHaveLength(1);
      expect(northRes.body.breakdowns.byOperator[0]).toMatchObject({
        operatorUserId: secondOperatorUserId
      });
      expect(northRes.body.breakdowns.dailyTrend).toHaveLength(1);
      expect(northRes.body.breakdowns.dailyTrend[0].metrics).toMatchObject({
        total_pieces: 4,
        connector_total_runs: 2
      });
    } finally {
      await cleanupSeededData(recordIds, runIds);
      await updateModuleFlags(previousFlags);
    }
  });

  it("rejects wildcard site scope even when multisite is enabled", async () => {
    const previousFlags = await fetchModuleFlags();
    const updatedFlags = { ...previousFlags, MULTISITE: true, ANALYTICS_SUITE: true };
    await updateModuleFlags(updatedFlags);

    try {
      const res = await request(app)
        .get("/api/analytics/kpis/dashboard")
        .query({ siteId: "all" })
        .set("x-user-role", "Admin");

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ error: "invalid_site_scope" });
    } finally {
      await updateModuleFlags(previousFlags);
    }
  });
});
