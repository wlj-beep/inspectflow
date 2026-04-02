import crypto from "node:crypto";
import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../src/index.js";
import { query } from "../src/db.js";

function randomSuffix() {
  return crypto.randomUUID().slice(0, 6).toLowerCase();
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

async function getOperatorUserId(offset = 0) {
  const { rows } = await query(
    "SELECT id FROM users WHERE role='Operator' ORDER BY id ASC OFFSET $1 LIMIT 1",
    [offset]
  );
  return rows[0]?.id || null;
}

async function createImportRun({ suffix }) {
  const { rows } = await query(
    `INSERT INTO import_runs
       (integration_id, source_type, import_type, trigger_mode, status,
        total_rows, inserted_count, updated_count, failed_count, summary, errors, created_at)
     VALUES (NULL, 'api_pull', 'jobs', 'manual', 'success',
        1, 1, 0, 0, $1::jsonb, '[]'::jsonb, NOW())
     RETURNING id`,
    [JSON.stringify({ note: `pilot-readiness-${suffix}` })]
  );
  return Number(rows[0]?.id || 0);
}

async function createRecord({ job, operatorUserId }) {
  const { rows } = await query(
    `INSERT INTO records
       (job_id, part_id, operation_id, lot, qty, timestamp, operator_user_id, status, oot, comment)
     VALUES ($1,$2,$3,$4,1,NOW(),$5,'complete',false,'pilot readiness seed')
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
  workCenterId
}) {
  await query(
    `INSERT INTO ana_mart_inspection_fact
       (record_id, dimension_id, piece_number, site_id, job_id, part_id, operation_id, lot,
        work_center_id, operator_user_id, event_at, measurement_count, oot_count, pass_count, rework_count, source_run_id)
     VALUES ($1,1,1,$2,$3,$4,$5,$6,$7,$8,NOW(),$9,$10,$11,0,$12)`,
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

describe("pilot readiness scorecard analytics (BL-106)", () => {
  it("returns a deterministic customer-site scorecard payload for all visible sites", async () => {
    const previousFlags = await fetchModuleFlags();
    await updateModuleFlags({ ...previousFlags, MULTISITE: true, ANALYTICS_SUITE: true });

    const recordIds = [];
    const runIds = [];
    try {
      const job = await getSeedJob();
      const operatorA = await getOperatorUserId(0);
      const operatorB = await getOperatorUserId(1);
      expect(job).toBeTruthy();
      expect(operatorA).toBeTruthy();
      expect(operatorB).toBeTruthy();

      const suffix = randomSuffix();
      const siteAlpha = `alpha-${suffix}`;
      const siteBeta = `beta-${suffix}`;
      const alphaRun = await createImportRun({ suffix: `${suffix}-alpha` });
      const betaRun = await createImportRun({ suffix: `${suffix}-beta` });
      runIds.push(alphaRun, betaRun);

      const alphaRecord = await createRecord({ job, operatorUserId: operatorA });
      const betaRecord = await createRecord({ job, operatorUserId: operatorB });
      recordIds.push(alphaRecord, betaRecord);

      await insertInspectionFact({
        recordId: alphaRecord,
        job,
        operatorUserId: operatorA,
        siteId: siteAlpha,
        sourceRunId: alphaRun,
        measurementCount: 12,
        passCount: 12,
        ootCount: 0,
        workCenterId: `wc-${siteAlpha}`
      });
      await insertInspectionFact({
        recordId: betaRecord,
        job,
        operatorUserId: operatorB,
        siteId: siteBeta,
        sourceRunId: betaRun,
        measurementCount: 2,
        passCount: 1,
        ootCount: 1,
        workCenterId: `wc-${siteBeta}`
      });

      await insertConnectorFact({
        runId: alphaRun,
        siteId: siteAlpha,
        runCount: 4,
        failureCount: 0,
        replayedCount: 0,
        processedCount: 12
      });

      const res = await request(app)
        .get("/api/analytics/pilot-readiness/scorecard")
        .set("x-user-role", "Admin");

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        contractId: "COMM-GTM-v1",
        dashboardId: "pilot_readiness_scorecard_v1",
        multisiteEnabled: true,
        siteScope: "all"
      });
      expect(res.body.window).toEqual({
        dateFrom: expect.any(String),
        dateTo: expect.any(String)
      });
      expect(Array.isArray(res.body.sites)).toBe(true);
      expect(res.body.sites.length).toBeGreaterThanOrEqual(2);

      const alpha = res.body.sites.find((site) => site.siteId === siteAlpha);
      const beta = res.body.sites.find((site) => site.siteId === siteBeta);
      expect(alpha).toBeTruthy();
      expect(beta).toBeTruthy();

      expect(alpha).toMatchObject({
        siteId: siteAlpha,
        valueScore: expect.any(Number),
        deploymentCompletion: {
          score: 100,
          status: "ready",
          signals: {
            connectorActivity: true,
            inspectionsCaptured: true,
            traceableJobs: true,
            operatorCoverage: true,
            workCenterCoverage: true
          }
        },
        adoptionMilestone: {
          score: 37,
          milestone: "activated"
        },
        renewalRisk: {
          score: 16,
          level: "low"
        },
        metrics: {
          jobCount: 1,
          operatorCount: 1,
          workCenterCount: 1,
          activeDays: 1,
          measurementCount: 12,
          passCount: 12,
          ootCount: 0,
          connectorRuns: 4
        }
      });

      expect(beta).toMatchObject({
        siteId: siteBeta,
        valueScore: expect.any(Number),
        deploymentCompletion: {
          score: 80,
          status: "in_progress",
          signals: {
            connectorActivity: false,
            inspectionsCaptured: true,
            traceableJobs: true,
            operatorCoverage: true,
            workCenterCoverage: true
          }
        },
        adoptionMilestone: {
          score: 23,
          milestone: "activated"
        },
        renewalRisk: {
          score: 45,
          level: "medium"
        },
        metrics: {
          jobCount: 1,
          operatorCount: 1,
          workCenterCount: 1,
          activeDays: 1,
          measurementCount: 2,
          passCount: 1,
          ootCount: 1,
          connectorRuns: 0
        }
      });
    } finally {
      await cleanupSeededData(recordIds, runIds);
      await updateModuleFlags(previousFlags);
    }
  });

  it("scopes the scorecard payload to the requested customer site", async () => {
    const previousFlags = await fetchModuleFlags();
    await updateModuleFlags({ ...previousFlags, MULTISITE: true, ANALYTICS_SUITE: true });

    const recordIds = [];
    const runIds = [];
    try {
      const job = await getSeedJob();
      const operatorUserId = await getOperatorUserId(0);
      expect(job).toBeTruthy();
      expect(operatorUserId).toBeTruthy();

      const suffix = randomSuffix();
      const siteFocus = `focus-${suffix}`;
      const siteOther = `other-${suffix}`;
      const focusRun = await createImportRun({ suffix: `${suffix}-focus` });
      const otherRun = await createImportRun({ suffix: `${suffix}-other` });
      runIds.push(focusRun, otherRun);

      const focusRecord = await createRecord({ job, operatorUserId });
      const otherRecord = await createRecord({ job, operatorUserId });
      recordIds.push(focusRecord, otherRecord);

      await insertInspectionFact({
        recordId: focusRecord,
        job,
        operatorUserId,
        siteId: siteFocus,
        sourceRunId: focusRun,
        measurementCount: 9,
        passCount: 8,
        ootCount: 1,
        workCenterId: `wc-${siteFocus}`
      });
      await insertInspectionFact({
        recordId: otherRecord,
        job,
        operatorUserId,
        siteId: siteOther,
        sourceRunId: otherRun,
        measurementCount: 5,
        passCount: 5,
        ootCount: 0,
        workCenterId: `wc-${siteOther}`
      });
      await insertConnectorFact({
        runId: focusRun,
        siteId: siteFocus,
        runCount: 2,
        failureCount: 0,
        replayedCount: 0,
        processedCount: 9
      });
      await insertConnectorFact({
        runId: otherRun,
        siteId: siteOther,
        runCount: 3,
        failureCount: 0,
        replayedCount: 0,
        processedCount: 5
      });

      const res = await request(app)
        .get("/api/analytics/pilot-readiness/scorecard")
        .query({ siteId: siteFocus })
        .set("x-user-role", "Admin");

      expect(res.status).toBe(200);
      expect(res.body.siteScope).toBe(siteFocus);
      expect(res.body.sites).toHaveLength(1);
      expect(res.body.sites[0]).toMatchObject({
        siteId: siteFocus,
        deploymentCompletion: {
          status: "ready"
        },
        adoptionMilestone: {
          milestone: "activated"
        },
        renewalRisk: {
          level: "medium"
        }
      });
    } finally {
      await cleanupSeededData(recordIds, runIds);
      await updateModuleFlags(previousFlags);
    }
  });
});
