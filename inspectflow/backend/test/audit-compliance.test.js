import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/index.js";
import { query } from "../src/db.js";
import { createTestSession, cleanupTestUsers } from "./helpers/sessionFixtures.js";

const createdUserIds = [];
const createdJobIds = [];
const createdRecordIds = [];
const createdAuditIds = [];
const createdSessionUserIds = [];

let fixture;
let adminSession;

async function insertUser(name, role) {
  const result = await query(
    "INSERT INTO users (name, role, active) VALUES ($1,$2,true) RETURNING id, name, role",
    [name, role]
  );
  const user = result.rows[0];
  createdUserIds.push(Number(user.id));
  return user;
}

async function seedAuditFixture() {
  const suffix = crypto.randomUUID().slice(0, 8).toUpperCase();
  const operator = await insertUser(`Audit Operator ${suffix}`, "Operator");
  const admin = await insertUser(`Audit Admin ${suffix}`, "Admin");

  const opRes = await query(
    "SELECT id FROM operations WHERE part_id=$1 AND op_number=$2 LIMIT 1",
    ["1234", "20"]
  );
  const operationId = opRes.rows[0]?.id;
  expect(operationId).toBeTruthy();

  const jobId = `AUD-${suffix}`;
  await query(
    `INSERT INTO jobs (id, part_id, part_revision_code, operation_id, lot, qty, status)
     VALUES ($1,$2,'A',$3,$4,$5,$6)`,
    [jobId, "1234", operationId, `Lot ${suffix}`, 5, "open"]
  );
  createdJobIds.push(jobId);

  const recordRes = await query(
    `INSERT INTO records
       (job_id, part_id, operation_id, lot, serial_number, qty, timestamp, operator_user_id, status, oot, comment)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING id`,
    [
      jobId,
      "1234",
      operationId,
      `Lot ${suffix}`,
      `SN-${suffix}`,
      5,
      "2026-03-18T09:00:00.000Z",
      operator.id,
      "complete",
      false,
      `Record ${suffix}`
    ]
  );
  const recordId = recordRes.rows[0].id;
  createdRecordIds.push(recordId);

  const auditRows = [
    {
      userId: admin.id,
      field: "comment",
      beforeValue: "before-admin",
      afterValue: "after-admin",
      reason: "admin note",
      timestamp: "2026-03-18T10:00:00.000Z"
    },
    {
      userId: operator.id,
      field: "comment",
      beforeValue: "before-operator",
      afterValue: "after-operator",
      reason: "operator note",
      timestamp: "2026-03-19T10:00:00.000Z"
    },
    {
      userId: admin.id,
      field: "status",
      beforeValue: "draft",
      afterValue: "complete",
      reason: "status note",
      timestamp: "2026-03-20T10:00:00.000Z"
    }
  ];

  for (const row of auditRows) {
    const inserted = await query(
      `INSERT INTO audit_log
         (record_id, user_id, field, before_value, after_value, reason, timestamp)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id`,
      [
        recordId,
        row.userId,
        row.field,
        row.beforeValue,
        row.afterValue,
        row.reason,
        row.timestamp
      ]
    );
    createdAuditIds.push(inserted.rows[0].id);
  }

  return { operator, admin, recordId };
}

async function cleanupFixture() {
  while (createdAuditIds.length) {
    await query("DELETE FROM audit_log WHERE id=$1", [createdAuditIds.pop()]);
  }
  while (createdRecordIds.length) {
    await query("DELETE FROM records WHERE id=$1", [createdRecordIds.pop()]);
  }
  while (createdJobIds.length) {
    await query("DELETE FROM jobs WHERE id=$1", [createdJobIds.pop()]);
  }
  while (createdUserIds.length) {
    await query("DELETE FROM users WHERE id=$1", [createdUserIds.pop()]);
  }
}

beforeAll(async () => {
  await query(
    `INSERT INTO role_capabilities (role, capability)
     VALUES ('Admin', 'view_audit_summary')
     ON CONFLICT DO NOTHING`
  );
  adminSession = await createTestSession("Admin");
  createdSessionUserIds.push(adminSession.userId);
  fixture = await seedAuditFixture();
});

afterAll(async () => {
  await cleanupFixture();
  await cleanupTestUsers(createdSessionUserIds);
});

describe("audit compliance API", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await request(app).get("/api/audit");

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: "unauthenticated" });
  });

  it("filters list results with record, user, field, date range, and limit", async () => {
    const broad = await request(app)
      .get("/api/audit")
      .set("Cookie", adminSession.cookie)
      .query({
        recordId: fixture.recordId,
        limit: 2
      });

    expect(broad.status).toBe(200);
    expect(Array.isArray(broad.body)).toBe(true);
    expect(broad.body).toHaveLength(2);
    expect(broad.body[0]).toMatchObject({
      record_id: fixture.recordId,
      field: "status",
      reason: "status note"
    });
    expect(broad.body[1]).toMatchObject({
      record_id: fixture.recordId,
      field: "comment",
      reason: "operator note"
    });

    const filtered = await request(app)
      .get("/api/audit")
      .set("Cookie", adminSession.cookie)
      .query({
        recordId: fixture.recordId,
        userId: fixture.operator.id,
        field: "comment",
        from: "2026-03-19T00:00:00.000Z",
        to: "2026-03-19T23:59:59.999Z",
        limit: 10
      });

    expect(filtered.status).toBe(200);
    expect(filtered.body).toHaveLength(1);
    expect(filtered.body[0]).toMatchObject({
      record_id: fixture.recordId,
      user_id: fixture.operator.id,
      field: "comment",
      reason: "operator note"
    });
  });

  it("supports explicit sort controls and rejects invalid sort columns", async () => {
    const asc = await request(app)
      .get("/api/audit")
      .set("Cookie", adminSession.cookie)
      .query({
        recordId: fixture.recordId,
        sortBy: "timestamp",
        sortDir: "asc",
        limit: 10
      });

    expect(asc.status).toBe(200);
    expect(asc.body).toHaveLength(3);
    expect(asc.body[0]).toMatchObject({ reason: "admin note" });
    expect(asc.body[1]).toMatchObject({ reason: "operator note" });
    expect(asc.body[2]).toMatchObject({ reason: "status note" });

    const invalid = await request(app)
      .get("/api/audit")
      .set("Cookie", adminSession.cookie)
      .query({
        sortBy: "timestamp;DROP TABLE audit_log",
        limit: 10
      });

    expect(invalid.status).toBe(400);
    expect(invalid.body).toMatchObject({ error: "invalid_sortBy" });
  });

  it("returns csv content type and rows", async () => {
    const res = await request(app)
      .get("/api/audit/export.csv")
      .set("Cookie", adminSession.cookie)
      .query({
        recordId: fixture.recordId,
        field: "comment",
        sortDir: "asc",
        limit: 10
      });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["transfer-encoding"]).toBe("chunked");

    const lines = res.text.trim().split(/\r?\n/);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe("id,record_id,user_id,user_name,timestamp,field,before_value,after_value,reason");
    expect(lines[1]).toContain(String(fixture.recordId));
    expect(lines[1]).toContain("admin note");
    expect(lines[2]).toContain("operator note");
  });

  it("returns summary counts by field and by user", async () => {
    const res = await request(app)
      .get("/api/audit/summary")
      .set("Cookie", adminSession.cookie)
      .query({
        recordId: fixture.recordId,
        from: "2026-03-18T00:00:00.000Z",
        to: "2026-03-20T23:59:59.999Z"
      });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      total: 3
    });
    expect(res.body.byField).toEqual([
      { field: "comment", count: 2 },
      { field: "status", count: 1 }
    ]);
    expect(res.body.byUser).toEqual([
      { user_id: fixture.admin.id, user_name: fixture.admin.name, count: 2 },
      { user_id: fixture.operator.id, user_name: fixture.operator.name, count: 1 }
    ]);
    expect(res.body.byFieldPagination).toMatchObject({
      page: 1,
      pageSize: 100,
      totalCount: 2,
      totalPages: 1,
      hasPreviousPage: false,
      hasNextPage: false
    });
    expect(res.body.byUserPagination).toMatchObject({
      page: 1,
      pageSize: 100,
      totalCount: 2,
      totalPages: 1,
      hasPreviousPage: false,
      hasNextPage: false
    });
  });

  it("paginates summary results and preserves total-count metadata", async () => {
    const res = await request(app)
      .get("/api/audit/summary")
      .set("Cookie", adminSession.cookie)
      .query({
        recordId: fixture.recordId,
        page: 2,
        pageSize: 1
      });

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.byField).toEqual([{ field: "status", count: 1 }]);
    expect(res.body.byFieldPagination).toMatchObject({
      page: 2,
      pageSize: 1,
      totalCount: 2,
      totalPages: 2,
      hasPreviousPage: true,
      hasNextPage: false
    });
    expect(res.body.byUser).toEqual([
      { user_id: fixture.operator.id, user_name: fixture.operator.name, count: 1 }
    ]);
    expect(res.body.byUserPagination).toMatchObject({
      page: 2,
      pageSize: 1,
      totalCount: 2,
      totalPages: 2,
      hasPreviousPage: true,
      hasNextPage: false
    });
  });

  it("caps summary page size at 1000 rows", async () => {
    const res = await request(app)
      .get("/api/audit/summary")
      .set("Cookie", adminSession.cookie)
      .query({
        recordId: fixture.recordId,
        pageSize: 5000
      });

    expect(res.status).toBe(200);
    expect(res.body.byFieldPagination.pageSize).toBe(1000);
    expect(res.body.byUserPagination.pageSize).toBe(1000);
  });
});
