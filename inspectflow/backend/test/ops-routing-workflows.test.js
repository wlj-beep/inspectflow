import crypto from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/index.js";
import { query } from "../src/db.js";
import { getDefaultSeedPassword } from "../src/auth.js";

const DEFAULT_PASSWORD = getDefaultSeedPassword();

function nextPartId(prefix = "P-ROUTE") {
  return `${prefix}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
}

async function createPart(partId, roleHeader = "Admin") {
  const res = await request(app)
    .post("/api/parts")
    .set("x-user-role", roleHeader)
    .send({ id: partId, description: `Routing test ${partId}`, revision: "A" });
  expect(res.status).toBe(201);
}

async function createOperation(partId, opNumber, label, roleHeader = "Admin") {
  const res = await request(app)
    .post("/api/operations")
    .set("x-user-role", roleHeader)
    .send({ partId, opNumber, label });
  expect(res.status).toBe(201);
  return res.body;
}

async function latestPartRevision(partId) {
  const { rows } = await query(
    `SELECT revision_code, change_summary, changed_fields, created_by_role
     FROM part_setup_revisions
     WHERE part_id=$1
     ORDER BY revision_index DESC
     LIMIT 1`,
    [partId]
  );
  return rows[0] || null;
}

describe("OPS routing workflows", () => {
  afterEach(() => {
    delete process.env.ALLOW_LEGACY_ROLE_HEADER;
  });

  it("re-sequences selected operations with revision trace", async () => {
    const partId = nextPartId();
    await createPart(partId);

    const op010 = await createOperation(partId, "010", "Cut");
    const op020 = await createOperation(partId, "020", "Drill");
    await createOperation(partId, "030", "Deburr");

    const resequenceRes = await request(app)
      .post("/api/operations/resequence")
      .set("x-user-role", "Admin")
      .send({
        partId,
        reason: "route balancing",
        sequence: [
          { operationId: op010.id, opNumber: "020" },
          { operationId: op020.id, opNumber: "010" }
        ]
      });

    expect(resequenceRes.status).toBe(200);
    expect(resequenceRes.body).toMatchObject({
      partId,
      revisionCreated: true
    });

    const opRows = await query(
      "SELECT id, op_number FROM operations WHERE part_id=$1 ORDER BY id ASC",
      [partId]
    );
    const opMap = new Map(opRows.rows.map((row) => [Number(row.id), row.op_number]));
    expect(opMap.get(op010.id)).toBe("020");
    expect(opMap.get(op020.id)).toBe("010");

    const revision = await latestPartRevision(partId);
    expect(revision?.change_summary).toContain("Resequenced operations");
    expect(revision?.changed_fields).toEqual(expect.arrayContaining(["operations.routing"]));
    expect(revision?.created_by_role).toBe("Admin");
  });

  it("moves an operation across parts and records source/target revision trace", async () => {
    const sourcePart = nextPartId("P-SRC");
    const targetPart = nextPartId("P-DST");
    await createPart(sourcePart);
    await createPart(targetPart);

    const sourceOp = await createOperation(sourcePart, "010", "Inspect");

    const moveRes = await request(app)
      .post(`/api/operations/${sourceOp.id}/move`)
      .set("x-user-role", "Admin")
      .send({
        targetPartId: targetPart,
        targetOpNumber: "050",
        reason: "move to finishing cell"
      });

    expect(moveRes.status).toBe(200);
    expect(moveRes.body).toMatchObject({
      id: sourceOp.id,
      part_id: targetPart,
      op_number: "050",
      sourcePartId: sourcePart,
      targetPartId: targetPart,
      revisionCreated: true
    });

    const opRow = await query(
      "SELECT part_id, op_number FROM operations WHERE id=$1",
      [sourceOp.id]
    );
    expect(opRow.rows[0]).toMatchObject({ part_id: targetPart, op_number: "050" });

    const sourceRevision = await latestPartRevision(sourcePart);
    const targetRevision = await latestPartRevision(targetPart);
    expect(sourceRevision?.change_summary).toContain("Moved operation");
    expect(sourceRevision?.changed_fields).toEqual(expect.arrayContaining(["operations.routing"]));
    expect(targetRevision?.change_summary).toContain("Received operation");
    expect(targetRevision?.changed_fields).toEqual(expect.arrayContaining(["operations.routing"]));
  });

  it("uses authenticated identity role for routing revisions even when role header is spoofed", async () => {
    process.env.ALLOW_LEGACY_ROLE_HEADER = "false";
    const agent = request.agent(app);
    const login = await agent
      .post("/api/auth/login")
      .send({ username: "S. Admin", password: DEFAULT_PASSWORD });
    expect(login.status).toBe(200);

    const partId = nextPartId("P-AUTH");
    const partRes = await agent.post("/api/parts").send({ id: partId, description: "Auth routing test", revision: "A" });
    expect(partRes.status).toBe(201);
    const op1Res = await agent.post("/api/operations").send({ partId, opNumber: "010", label: "A" });
    const op2Res = await agent.post("/api/operations").send({ partId, opNumber: "020", label: "B" });
    expect(op1Res.status).toBe(201);
    expect(op2Res.status).toBe(201);

    const resequenceRes = await agent
      .post("/api/operations/resequence")
      .set("x-user-role", "Operator")
      .send({
        partId,
        reason: "auth identity precedence",
        sequence: [
          { operationId: op1Res.body.id, opNumber: "020" },
          { operationId: op2Res.body.id, opNumber: "010" }
        ]
      });
    expect(resequenceRes.status).toBe(200);

    const revision = await latestPartRevision(partId);
    expect(revision?.created_by_role).toBe("Admin");
  });
});
