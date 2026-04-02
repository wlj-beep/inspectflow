import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, beforeAll } from "vitest";
import request from "supertest";
import app from "../src/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const varDir = path.join(repoRoot, "var");
const backupsDir = path.join(varDir, "backups");
const logsDir = path.join(varDir, "log");
const backupLogFile = path.join(logsDir, "backup-workflow.log");

async function seedTechnicalOpsFixtures() {
  const runId = "20260314T220000Z";
  const runPath = path.join(backupsDir, runId);
  await fs.mkdir(runPath, { recursive: true });
  await fs.mkdir(logsDir, { recursive: true });

  await fs.writeFile(path.join(runPath, "database.dump"), "fixture-dump-content", "utf8");
  await fs.writeFile(
    path.join(runPath, "manifest.json"),
    JSON.stringify({
      runId,
      createdAt: "2026-03-14T22:00:00.000Z",
      databaseDump: "database.dump",
      configArchive: "config.tgz",
      retentionDays: 14
    }),
    "utf8"
  );

  const lines = [
    JSON.stringify({
      ts: "2026-03-14T21:59:00Z",
      level: "info",
      action: "backup",
      status: "started",
      message: "Backup started",
      details: "run_id=20260314T220000Z"
    }),
    JSON.stringify({
      ts: "2026-03-14T22:00:02Z",
      level: "info",
      action: "backup",
      status: "ok",
      message: "Backup completed",
      details: "path=/tmp/fixture"
    })
  ];
  await fs.writeFile(backupLogFile, `${lines.join("\n")}\n`, "utf8");
}

describe("technical ops API", () => {
  beforeAll(async () => {
    await seedTechnicalOpsFixtures();
  });

  it("requires admin capability", async () => {
    const res = await request(app)
      .get("/api/technical-ops/summary")
      .set("x-user-role", "Operator");

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: "forbidden" });
  });

  it("returns summary payload with health, storage, backup, and event signals", async () => {
    const res = await request(app)
      .get("/api/technical-ops/summary")
      .set("x-user-role", "Admin");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      contractId: "PLAT-DEPLOY-v1"
    });
    expect(res.body.health?.service).toBe("inspectflow-backend");
    expect(res.body.posture).toMatchObject({
      contractId: "PLAT-OPS-v1",
      status: expect.stringMatching(/healthy|warning|degraded|down/),
      tone: expect.stringMatching(/success|warning|danger/)
    });
    expect(res.body.runtimeSlo).toMatchObject({
      contractId: "PLAT-SLO-v1",
      current: {
        status: expect.stringMatching(/healthy|warning|degraded|down/),
        tone: expect.stringMatching(/success|warning|danger/)
      },
      targets: {
        uptime: {
          targetPct: 99.5
        },
        importSuccess: {
          targetPct: 99
        }
      }
    });
    expect(Array.isArray(res.body.runtimeSlo?.signals)).toBe(true);
    expect(Array.isArray(res.body.posture?.signals)).toBe(true);
    expect(res.body.runtimeSlo?.alertThresholds).toMatchObject({
      backupFreshnessHours: {
        warning: 24,
        degraded: 72
      }
    });
    expect(res.body.runtimeSlo?.incidentResponse).toMatchObject({
      runbookPath: "docs/technical-ops-runbook.md"
    });
    expect(typeof res.body.database?.counts?.users_count).toBe("number");
    expect(res.body.storage?.directories?.backups).toMatchObject({ exists: true });
    expect(res.body.backups?.recentBackups?.length).toBeGreaterThan(0);
    expect(Array.isArray(res.body.events?.importRunStatus7d)).toBe(true);
  });

  it("supports focused endpoints for health/storage/backups/events", async () => {
    const [healthRes, storageRes, backupsRes, eventsRes] = await Promise.all([
      request(app).get("/api/technical-ops/health").set("x-user-role", "Admin"),
      request(app).get("/api/technical-ops/storage").set("x-user-role", "Admin"),
      request(app).get("/api/technical-ops/backups").set("x-user-role", "Admin"),
      request(app).get("/api/technical-ops/events").set("x-user-role", "Admin")
    ]);

    expect(healthRes.status).toBe(200);
    expect(storageRes.status).toBe(200);
    expect(backupsRes.status).toBe(200);
    expect(eventsRes.status).toBe(200);

    expect(typeof healthRes.body.process?.uptimeSeconds).toBe("number");
    expect(typeof storageRes.body.memory?.totalBytes).toBe("number");
    expect(Array.isArray(backupsRes.body.recentBackups)).toBe(true);
    expect(Array.isArray(eventsRes.body.recentImportErrors)).toBe(true);
  });

  it("surfaces integration monitoring and run history views", async () => {
    const suffix = crypto.randomUUID().slice(0, 6).toUpperCase();
    const integration = await request(app)
      .post("/api/imports/integrations")
      .set("x-user-role", "Admin")
      .send({
        name: `Ops Monitor ${suffix}`,
        sourceType: "api_pull",
        importType: "jobs",
        enabled: true
      });
    expect(integration.status).toBe(201);

    const payload = {
      csvText: [
        "job_id,part_id,part_revision,op_number,lot,qty,status",
        `J-OPS-${suffix},1234,A,020,Lot Ops,2,open`
      ].join("\n")
    };

    const run = await request(app)
      .post(`/api/imports/integrations/${integration.body.id}/pull`)
      .set("x-user-role", "Admin")
      .send(payload);
    expect(run.status).toBe(200);

    const monitoring = await request(app)
      .get("/api/technical-ops/integrations/monitoring")
      .set("x-user-role", "Admin");
    expect(monitoring.status).toBe(200);
    expect(Array.isArray(monitoring.body.integrations)).toBe(true);
    const row = monitoring.body.integrations.find((item) => Number(item.id) === Number(integration.body.id));
    expect(row).toBeTruthy();
    expect(["healthy", "degraded", "down", "unknown", "disabled"]).toContain(row.healthIndicator);

    const history = await request(app)
      .get(`/api/technical-ops/integrations/${integration.body.id}/runs`)
      .set("x-user-role", "Admin");
    expect(history.status).toBe(200);
    expect(history.body.integration?.id).toBe(integration.body.id);
    expect(Array.isArray(history.body.runs)).toBe(true);
    expect(history.body.runs.length).toBeGreaterThan(0);
  });

  it("exposes and updates lifecycle retention policy controls", async () => {
    const before = await request(app)
      .get("/api/technical-ops/lifecycle/summary")
      .set("x-user-role", "Admin");
    expect(before.status).toBe(200);
    expect(before.body.policy).toBeTruthy();
    expect(before.body.dataGrowth).toMatchObject({
      reviewCadenceDays: 30,
      archivalRollbackWindowDays: 14
    });
    expect(before.body.operatorControls?.policyEvidenceEndpoint).toBe("/api/technical-ops/lifecycle/summary");
    expect(before.body.operatorControls?.runbookPath).toBe("docs/technical-ops-runbook.md");

    const recordsRecommendation = before.body.dataGrowth?.recommendations?.find((item) => item.table === "records");
    expect(recordsRecommendation).toBeTruthy();
    expect(recordsRecommendation.partitionKey).toBe("timestamp");
    expect(Array.isArray(recordsRecommendation.indexGuidance)).toBe(true);

    const recordsFootprint = before.body.dataGrowth?.currentFootprint?.tables?.find((item) => item.table === "records");
    expect(recordsFootprint).toBeTruthy();
    expect(typeof recordsFootprint.rowCount).toBe("number");
    expect(["within_policy", "review_required"]).toContain(recordsFootprint.reviewStatus);
    expect(Array.isArray(before.body.dataGrowth?.operatorNotes)).toBe(true);

    const updated = await request(app)
      .post("/api/technical-ops/lifecycle/retention")
      .set("x-user-role", "Admin")
      .send({
        backupRetentionDays: 21,
        targetBackupBudgetMb: 3072,
        targetLogBudgetMb: 1536
      });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({
      ok: true,
      policy: {
        backupRetentionDays: 21,
        targetBackupBudgetMb: 3072,
        targetLogBudgetMb: 1536
      }
    });
    expect(updated.body.policy?.dataGrowthPolicy?.schemaVersion).toBe("tech-ops-data-growth-v1");

    const after = await request(app)
      .get("/api/technical-ops/lifecycle/summary")
      .set("x-user-role", "Admin");
    expect(after.status).toBe(200);
    expect(after.body.policy).toMatchObject({
      backupRetentionDays: 21,
      targetBackupBudgetMb: 3072,
      targetLogBudgetMb: 1536
    });
    expect(after.body.operatorControls?.retentionUpdateEndpoint).toBe("/api/technical-ops/lifecycle/retention");
    expect(after.body.dataGrowth?.currentFootprint?.backupBytes).toBe(after.body.footprint?.backupBytes);
  });
});
