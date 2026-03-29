/**
 * Focused tests for BL-142 and BL-143.
 */

import crypto from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/index.js";
import { query } from "../src/db.js";
import { createTestSession, cleanupTestUsers } from "./helpers/sessionFixtures.js";

const trackedUserIds = [];
const trackedJobIds = [];
const trackedRecordIds = [];

function suffix() {
  return crypto.randomUUID().slice(0, 8);
}

async function createTestJob() {
  const { rows: seedJobs } = await query(
    "SELECT id, part_id, operation_id FROM jobs WHERE status IN ('open','draft') ORDER BY id ASC LIMIT 1"
  );
  const seedJob = seedJobs[0];
  if (!seedJob) {
    throw new Error("No seed job available for records test");
  }

  const jobId = `J-BL142-${suffix()}`;
  const lot = `LOT-BL142-${suffix()}`;
  await query(
    "INSERT INTO jobs (id, part_id, operation_id, lot, qty, status) VALUES ($1,$2,$3,$4,$5,'open')",
    [jobId, seedJob.part_id, seedJob.operation_id, lot, 1]
  );
  trackedJobIds.push(jobId);
  return { jobId, partId: seedJob.part_id, operationId: seedJob.operation_id, qty: 1, lot };
}

async function cleanupRecords() {
  for (const id of trackedRecordIds.splice(0).reverse()) {
    await query("DELETE FROM record_piece_comment_audit WHERE record_id=$1", [id]).catch(() => {});
    await query("DELETE FROM audit_log WHERE record_id=$1", [id]).catch(() => {});
    await query("DELETE FROM record_attachments WHERE record_id=$1", [id]).catch(() => {});
    await query("DELETE FROM record_piece_comments WHERE record_id=$1", [id]).catch(() => {});
    await query("DELETE FROM missing_pieces WHERE record_id=$1", [id]).catch(() => {});
    await query("DELETE FROM record_tools WHERE record_id=$1", [id]).catch(() => {});
    await query("DELETE FROM record_values WHERE record_id=$1", [id]).catch(() => {});
    await query("DELETE FROM record_dimension_snapshots WHERE record_id=$1", [id]).catch(() => {});
    await query("DELETE FROM records WHERE id=$1", [id]).catch(() => {});
  }
}

async function cleanupJobs() {
  for (const id of trackedJobIds.splice(0).reverse()) {
    await query("DELETE FROM jobs WHERE id=$1", [id]).catch(() => {});
  }
}

afterEach(async () => {
  await cleanupRecords();
  await cleanupJobs();
  await cleanupTestUsers(trackedUserIds);
});

describe("API versioning compatibility", () => {
  it("serves /api/v1 and advertises the legacy /api alias", async () => {
    const quality = await createTestSession("Quality");
    trackedUserIds.push(quality.userId);

    const legacyRes = await request(app)
      .get("/api/records")
      .set("Cookie", quality.cookie);

    const versionedRes = await request(app)
      .get("/api/v1/records")
      .set("Cookie", quality.cookie);

    expect(legacyRes.status).toBe(200);
    expect(versionedRes.status).toBe(200);
    expect(legacyRes.headers["x-api-compatibility-alias"]).toBe("/api/v1");
    expect(versionedRes.headers["x-api-version"]).toBe("v1");
    expect(Array.isArray(legacyRes.body)).toBe(true);
    expect(Array.isArray(versionedRes.body)).toBe(true);
  });
});

describe("Record soft-delete", () => {
  it("rejects Operator delete attempts with 403", async () => {
    const operator = await createTestSession("Operator");
    trackedUserIds.push(operator.userId);

    const res = await request(app)
      .delete("/api/v1/records/1")
      .set("Cookie", operator.cookie);

    expect(res.status).toBe(403);
  });

  it("marks records deleted_at, hides them from active reads, and preserves audit history", async () => {
    const operator = await createTestSession("Operator");
    const quality = await createTestSession("Quality");
    trackedUserIds.push(operator.userId, quality.userId);

    const job = await createTestJob();

    const submitRes = await request(app)
      .post("/api/records")
      .set("Cookie", operator.cookie)
      .send({
        jobId: job.jobId,
        partId: job.partId,
        operationId: job.operationId,
        lot: job.lot,
        qty: job.qty,
        operatorUserId: operator.userId,
        status: "complete",
        oot: false,
        comment: null,
        values: [],
        tools: [],
        missingPieces: [],
        pieceComments: [],
        attachments: []
      });

    expect(submitRes.status).toBe(201);
    const recordId = submitRes.body.id;
    trackedRecordIds.push(recordId);

    const beforeDelete = await request(app)
      .get(`/api/v1/records/${recordId}`)
      .set("Cookie", quality.cookie);

    expect(beforeDelete.status).toBe(200);

    const deleteRes = await request(app)
      .delete(`/api/v1/records/${recordId}`)
      .set("Cookie", quality.cookie);

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.ok).toBe(true);
    expect(deleteRes.body.deletedAt).toBeTruthy();

    const dbRecord = await query(
      "SELECT deleted_at FROM records WHERE id=$1",
      [recordId]
    );
    expect(dbRecord.rows[0]?.deleted_at).toBeTruthy();

    const auditRow = await query(
      "SELECT field, reason, after_value FROM audit_log WHERE record_id=$1 AND field='deleted_at' ORDER BY id DESC LIMIT 1",
      [recordId]
    );
    expect(auditRow.rows[0]).toBeDefined();
    expect(auditRow.rows[0]?.reason).toContain("soft_delete");

    const afterDelete = await request(app)
      .get(`/api/records/${recordId}`)
      .set("Cookie", quality.cookie);
    expect(afterDelete.status).toBe(404);

    const listRes = await request(app)
      .get("/api/v1/records")
      .set("Cookie", quality.cookie);
    expect(listRes.status).toBe(200);
    expect(listRes.body.some((row) => row.id === recordId)).toBe(false);
  });
});
