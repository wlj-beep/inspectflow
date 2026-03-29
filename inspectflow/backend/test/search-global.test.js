import crypto from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/index.js";
import { query } from "../src/db.js";
import { makePasswordHash } from "../src/auth.js";

const TEST_PASSWORD = "inspectflow";
const createdUserIds = [];
const createdToolIds = [];
const createdJobIds = [];
const createdRecordIds = [];
const createdIssueIds = [];
const createdAuditIds = [];

function randomToken(prefix) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

async function createUser(name, role) {
  const inserted = await query(
    "INSERT INTO users (name, role, active) VALUES ($1,$2,true) RETURNING id, name, role",
    [name, role]
  );
  const user = inserted.rows[0];
  const hash = makePasswordHash(TEST_PASSWORD);
  await query(
    `INSERT INTO auth_local_credentials
       (user_id, password_salt, password_hash, failed_attempts, locked_until, must_rotate_password)
     VALUES ($1,$2,$3,0,NULL,false)`,
    [user.id, hash.salt, hash.hash]
  );
  createdUserIds.push(Number(user.id));
  return user;
}

async function loginAs(role, prefix) {
  const user = await createUser(`${prefix} ${role} ${crypto.randomUUID().slice(0, 6)}`, role);
  const agent = request.agent(app);
  const login = await agent.post("/api/auth/login").send({ username: user.name, password: TEST_PASSWORD });
  expect(login.status).toBe(200);
  return { agent, user };
}

async function getOperationId(partId, opNumber) {
  const { rows } = await query(
    "SELECT id FROM operations WHERE part_id=$1 AND op_number=$2 LIMIT 1",
    [partId, opNumber]
  );
  return rows[0]?.id;
}

async function seedSearchFixture() {
  const sharedToken = randomToken("SEARCH");
  const filterToken = randomToken("FILTER");
  const { agent: operatorAgent, user: operatorAgentUser } = await loginAs("Operator", `${sharedToken} Operator`);
  const { agent: adminAgent, user: adminUser } = await loginAs("Admin", `${sharedToken} Admin`);
  const { user: operatorUser } = await loginAs("Operator", `${sharedToken} Record`);

  const operationId = await getOperationId("1234", "20");
  expect(operationId).toBeTruthy();

  const jobId = `J-${sharedToken}`;
  await query(
    `INSERT INTO jobs (id, part_id, part_revision_code, operation_id, lot, qty, status)
     VALUES ($1,$2,'A',$3,$4,$5,$6)`,
    [jobId, "1234", operationId, `Lot ${sharedToken}`, 7, "open"]
  );
  createdJobIds.push(jobId);

  const recordRes = await query(
    `INSERT INTO records (job_id, part_id, operation_id, lot, serial_number, qty, operator_user_id, status, oot, comment)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING id`,
    [
      jobId,
      "1234",
      operationId,
      `Lot ${sharedToken}`,
      `SN-${sharedToken}`,
      7,
      operatorUser.id,
      "complete",
      false,
      `Record note ${sharedToken}`
    ]
  );
  const recordId = recordRes.rows[0].id;
  createdRecordIds.push(recordId);

  const toolRes = await query(
    `INSERT INTO tools (name, type, it_num, size, active, visible)
     VALUES ($1,$2,$3,$4,true,true)
     RETURNING id`,
    [`Tool ${sharedToken} ${filterToken}`, "Variable", `IT-${sharedToken.slice(0, 8)}`, "0-1 in"]
  );
  const toolId = toolRes.rows[0].id;
  createdToolIds.push(toolId);

  const issueRes = await query(
    `INSERT INTO issue_reports
       (category, details, status, part_id, operation_id, job_id, record_id, submitted_by_user_id, submitted_by_role)
     VALUES ($1,$2,'open',$3,$4,$5,$6,$7,$8)
     RETURNING id`,
    [
      "other",
      `Issue details ${sharedToken}`,
      "1234",
      operationId,
      jobId,
      recordId,
      adminUser.id,
      "Admin"
    ]
  );
  const issueId = issueRes.rows[0].id;
  createdIssueIds.push(issueId);

  const auditRes = await query(
    `INSERT INTO audit_log (record_id, user_id, field, before_value, after_value, reason)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id`,
    [
      recordId,
      adminUser.id,
      "comment",
      "before value",
      "after value",
      `Audit note ${sharedToken}`
    ]
  );
  const auditId = auditRes.rows[0].id;
  createdAuditIds.push(auditId);

  return {
    sharedToken,
    filterToken,
    operatorAgent,
    operatorAgentUser,
    adminAgent,
    operatorUser,
    recordId,
    jobId,
    toolId,
    issueId,
    auditId
  };
}

afterEach(async () => {
  while (createdAuditIds.length) {
    await query("DELETE FROM audit_log WHERE id=$1", [createdAuditIds.pop()]);
  }
  while (createdIssueIds.length) {
    await query("DELETE FROM issue_reports WHERE id=$1", [createdIssueIds.pop()]);
  }
  while (createdRecordIds.length) {
    await query("DELETE FROM records WHERE id=$1", [createdRecordIds.pop()]);
  }
  while (createdJobIds.length) {
    await query("DELETE FROM jobs WHERE id=$1", [createdJobIds.pop()]);
  }
  while (createdToolIds.length) {
    await query("DELETE FROM tools WHERE id=$1", [createdToolIds.pop()]);
  }
  while (createdUserIds.length) {
    await query("DELETE FROM users WHERE id=$1", [createdUserIds.pop()]);
  }
});

describe("global search", () => {
  it("returns 401 for unauthenticated requests", async () => {
    const res = await request(app).get("/api/search/global?q=test");
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: "unauthenticated" });
  });

  it("keeps operator search results out of admin-only entity types", async () => {
    const { operatorAgent, sharedToken } = await seedSearchFixture();
    const res = await operatorAgent.get(`/api/search/global?q=${encodeURIComponent(sharedToken)}&limit=20`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.some((item) => ["issue", "audit", "user"].includes(item.entityType))).toBe(false);
    expect(res.body.map((item) => item.entityType)).toEqual(expect.arrayContaining(["job", "record", "tool"]));
  });

  it("returns the broader entity set for admin users", async () => {
    const { adminAgent, sharedToken } = await seedSearchFixture();
    const res = await adminAgent.get(`/api/search/global?q=${encodeURIComponent(sharedToken)}&limit=20`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const types = new Set(res.body.map((item) => item.entityType));
    expect(types.has("job")).toBe(true);
    expect(types.has("record")).toBe(true);
    expect(types.has("tool")).toBe(true);
    expect(types.has("issue")).toBe(true);
    expect(types.has("audit")).toBe(true);
    expect(types.has("user")).toBe(true);
  });

  it("filters results by query term", async () => {
    const { operatorAgent, filterToken } = await seedSearchFixture();
    const res = await operatorAgent.get(`/api/search/global?q=${encodeURIComponent(filterToken)}&limit=20`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      entityType: "tool"
    });
    expect(res.body[0].title).toContain(filterToken);
  });

  // BL-128: site-scoped access controls — non-Admin user with a non-default site
  // assignment must still receive 200 (site-scope is resolved, not blocked).
  // Because the core operational tables (jobs, records, issue_reports, audit_log,
  // tools, users) do not carry a site_id column, no additional WHERE filtering is
  // applied inside the sub-queries; site-scoping is enforced at the access-resolution
  // layer and the allowedSiteIds list is threaded through for future table migrations.
  it("BL-128: non-Admin user with multi-site access resolves scope and receives results (200)", async () => {
    const { operatorAgent, sharedToken, operatorAgentUser } = await seedSearchFixture();
    await query(
      "INSERT INTO user_site_access (user_id, site_id, is_default) VALUES ($1,$2,false) ON CONFLICT (user_id, site_id) DO NOTHING",
      [operatorAgentUser.id, "site-b"]
    );
    const res = await operatorAgent.get(`/api/search/global?q=${encodeURIComponent(sharedToken)}&limit=20`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // Operator capability gates still apply — no admin-only entity types
    expect(res.body.some((item) => ["issue", "audit", "user"].includes(item.entityType))).toBe(false);
    expect(res.body.map((item) => item.entityType)).toEqual(expect.arrayContaining(["job", "record"]));
  });

  // BL-128: Admin users bypass all site restrictions and see results from every entity type.
  it("BL-128: Admin user sees all entity types regardless of site scope", async () => {
    const { adminAgent, sharedToken } = await seedSearchFixture();
    const res = await adminAgent.get(`/api/search/global?q=${encodeURIComponent(sharedToken)}&limit=20`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const types = new Set(res.body.map((item) => item.entityType));
    expect(types.has("job")).toBe(true);
    expect(types.has("record")).toBe(true);
    expect(types.has("issue")).toBe(true);
    expect(types.has("audit")).toBe(true);
    expect(types.has("user")).toBe(true);
  });

  // BL-128: Non-Admin user with only the default site sees results as expected.
  it("BL-128: non-Admin user with only default site access receives scoped results (200)", async () => {
    const { operatorAgent, sharedToken } = await seedSearchFixture();
    const res = await operatorAgent.get(`/api/search/global?q=${encodeURIComponent(sharedToken)}&limit=20`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    // Operator capability gates still apply
    expect(res.body.some((item) => ["issue", "audit", "user"].includes(item.entityType))).toBe(false);
  });
});
