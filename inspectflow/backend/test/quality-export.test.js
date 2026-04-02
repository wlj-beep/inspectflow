import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/index.js";
import { query } from "../src/db.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));

function readJsonFixture(fileName) {
  return JSON.parse(readFileSync(path.join(testDir, "fixtures", "quality", fileName), "utf8"));
}

function nextJobId(prefix) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

async function getOperationId(partId, opNumber) {
  const { rows } = await query(
    "SELECT id FROM operations WHERE part_id=$1 AND op_number=$2 LIMIT 1",
    [partId, opNumber]
  );
  return rows[0]?.id;
}

async function getFirstDimensionId(operationId) {
  const { rows } = await query(
    "SELECT id FROM dimensions WHERE operation_id=$1 ORDER BY id ASC LIMIT 1",
    [operationId]
  );
  return rows[0]?.id;
}

async function getUserIdByName(name) {
  const { rows } = await query(
    "SELECT id FROM users WHERE name=$1 LIMIT 1",
    [name]
  );
  return rows[0]?.id;
}

async function createDeterministicOperationFixture(prefix) {
  const partId = `P-${prefix}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
  const opNumber = "90";
  await query(
    "INSERT INTO parts (id, description) VALUES ($1, $2)",
    [partId, `Export fixture ${prefix}`]
  );
  const opInsert = await query(
    "INSERT INTO operations (part_id, op_number, label) VALUES ($1, $2, $3) RETURNING id",
    [partId, opNumber, "Export Fixture Op"]
  );
  const operationId = Number(opInsert.rows[0]?.id);
  const dimInsert = await query(
    `INSERT INTO dimensions
       (operation_id, name, nominal, tol_plus, tol_minus, unit, sampling, sampling_interval, input_mode)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, 'single')
     RETURNING id`,
    [operationId, `DIM-${prefix}`, 1.0, 0.1, 0.1, "in", "100pct"]
  );
  return {
    partId,
    operationId,
    dimensionId: Number(dimInsert.rows[0]?.id)
  };
}

async function createAs9102AcceptanceFixture(prefix) {
  const partId = `P-${prefix}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
  const toolSuffix = crypto.randomUUID().slice(0, 6).toUpperCase();
  const opNumber = "90";
  await query(
    "INSERT INTO parts (id, description) VALUES ($1, $2)",
    [partId, `AS9102 acceptance fixture ${prefix}`]
  );
  await query(
    `INSERT INTO part_setup_revisions
       (part_id, revision_code, revision_index, part_name, snapshot, change_summary, changed_fields, created_by_role)
     VALUES
       ($1, 'A', 1, $2, $3, $4, $5, 'Supervisor'),
       ($1, 'B', 2, $2, $3, $4, $5, 'Supervisor')
     ON CONFLICT (part_id, revision_code) DO NOTHING`,
    [
      partId,
      `AS9102 acceptance fixture ${prefix}`,
      JSON.stringify({ partId, prefix }),
      "Seeded acceptance fixture revisions",
      ["part_name", "description"]
    ]
  );
  const opInsert = await query(
    "INSERT INTO operations (part_id, op_number, label) VALUES ($1, $2, $3) RETURNING id",
    [partId, opNumber, "AS9102 Fixture Operation"]
  );
  const operationId = Number(opInsert.rows[0]?.id);
  const dimensions = [];
  for (const definition of [
    { name: "Bore Diameter", nominal: 1.0, tolPlus: 0.1, tolMinus: 0.1, unit: "in", sampling: "100pct", inputMode: "single" },
    { name: "Surface Finish", nominal: 32, tolPlus: 5, tolMinus: 5, unit: "Ra", sampling: "first_last", inputMode: "single" }
  ]) {
    const insert = await query(
      `INSERT INTO dimensions
         (operation_id, name, nominal, tol_plus, tol_minus, unit, sampling, sampling_interval, input_mode)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, $8)
       RETURNING id`,
      [operationId, definition.name, definition.nominal, definition.tolPlus, definition.tolMinus, definition.unit, definition.sampling, definition.inputMode]
    );
    dimensions.push({
      id: Number(insert.rows[0]?.id),
      name: definition.name
    });
  }

  const tools = [];
  for (const definition of [
    { name: `Fixture Bore Gage ${prefix}-${toolSuffix}`, itNum: `IT-${prefix}-${toolSuffix}-B`, type: "Variable" },
    { name: `Fixture Surface Comparator ${prefix}-${toolSuffix}`, itNum: `IT-${prefix}-${toolSuffix}-S`, type: "Attribute" }
  ]) {
    const insert = await query(
      `INSERT INTO tools (name, type, it_num, active, visible)
       VALUES ($1, $2, $3, true, true)
       RETURNING id, name, type, it_num`,
      [definition.name, definition.type, definition.itNum]
    );
    tools.push(insert.rows[0]);
  }

  await query(
    "INSERT INTO dimension_tools (dimension_id, tool_id) VALUES ($1, $2)",
    [dimensions[0].id, Number(tools[0].id)]
  );
  await query(
    "INSERT INTO dimension_tools (dimension_id, tool_id) VALUES ($1, $2)",
    [dimensions[1].id, Number(tools[1].id)]
  );

  return {
    partId,
    operationId,
    opNumber,
    dimensions,
    tools
  };
}

describe("quality export endpoints", () => {
  it("exports CSV and AS9102 starter output for a record", async () => {
    const opId = await getOperationId("1234", "20");
    expect(opId).toBeTruthy();

    const dimId = await getFirstDimensionId(opId);
    expect(dimId).toBeTruthy();

    const operatorId = await getUserIdByName("J. Morris");
    expect(operatorId).toBeTruthy();

    const jobId = nextJobId("J-EXP");
    const createJob = await request(app)
      .post("/api/jobs")
      .set("x-user-role", "Supervisor")
      .send({
        id: jobId,
        partId: "1234",
        partRevision: "A",
        operationId: opId,
        lot: "Lot EXP",
        qty: 2,
        status: "open"
      });
    expect(createJob.status).toBe(201);

    const submit = await request(app)
      .post("/api/records")
      .set("x-user-role", "Operator")
      .send({
        jobId,
        partId: "1234",
        operationId: opId,
        lot: "Lot EXP",
        qty: 2,
        operatorUserId: operatorId,
        status: "complete",
        oot: false,
        comment: "",
        values: [
          { dimensionId: dimId, pieceNumber: 1, value: "0.6250", isOot: false }
        ],
        tools: [],
        missingPieces: [],
        pieceComments: []
      });
    expect(submit.status).toBe(201);
    const recordId = submit.body.id;
    expect(recordId).toBeTruthy();

    const csv = await request(app)
      .get(`/api/records/${recordId}/export`)
      .set("x-user-role", "Supervisor");
    expect(csv.status).toBe(200);
    expect(csv.text).toContain("record_id,dimension_id,dimension_name,piece_number,value,is_oot");
    expect(csv.text).toContain(String(recordId));

    const as9102 = await request(app)
      .get(`/api/records/${recordId}/export/as9102?profile=as9102-basic`)
      .set("x-user-role", "Supervisor");
    expect(as9102.status).toBe(200);
    expect(as9102.body.profile).toMatchObject({
      id: "as9102-basic",
      name: "AS9102 Basic",
      version: "0.1.0"
    });
    expect(as9102.body.input?.part?.id).toBe("1234");
    expect(as9102.body.package?.contractId).toBe("QUAL-AS9102-PKG-v1");
    expect(Array.isArray(as9102.body.output?.artifacts)).toBe(true);
    expect(as9102.body.output.artifacts.length).toBeGreaterThan(0);
    const summary = as9102.body.output.artifacts.find((a) => a.templateId === "fai-summary-v1");
    expect(summary?.content || "").toContain("Part:");
    expect(summary?.content || "").toContain("Balloon Summary:");
    const packageArtifact = as9102.body.output.artifacts.find((artifact) => artifact.templateId === "fai-package-json-v1");
    expect(packageArtifact?.mediaType).toBe("application/json");

    const lineOnly = await request(app)
      .get(`/api/records/${recordId}/export/as9102?profile=as9102-line-only`)
      .set("x-user-role", "Supervisor");
    expect(lineOnly.status).toBe(200);
    expect(lineOnly.body.profile).toMatchObject({
      id: "as9102-line-only",
      name: "AS9102 Line Only",
      version: "0.1.0"
    });
    expect(lineOnly.body.record?.partId).toBe("1234");
    expect(lineOnly.body.record?.lot).toBe("Lot EXP");
    expect(Array.isArray(lineOnly.body.output?.artifacts)).toBe(true);
    expect(lineOnly.body.output.artifacts.map((artifact) => artifact.templateId)).toEqual(
      expect.arrayContaining(["fai-line-v1", "fai-package-json-v1"])
    );

    const fixturePack = await request(app)
      .get(`/api/records/${recordId}/export/as9102?profile=as9102-fixture-pack`)
      .set("x-user-role", "Supervisor");
    expect(fixturePack.status).toBe(200);
    expect(fixturePack.body.profile).toMatchObject({
      id: "as9102-fixture-pack",
      name: "AS9102 Fixture Pack",
      version: "0.1.0"
    });
    expect(fixturePack.body.output.artifacts.map((artifact) => artifact.templateId)).toEqual(
      expect.arrayContaining(["fai-summary-v1", "fai-fixture-v1", "fai-package-json-v1"])
    );
    expect(fixturePack.body.input?.balloonSummary || "").toContain("B1:#1");
    expect(fixturePack.body.input?.fixtureSummary || "").toContain("fixture-first-article");
    expect(fixturePack.body.output.artifacts.some((artifact) => artifact.templateId === "fai-fixture-v1")).toBe(true);

    const unknownProfile = await request(app)
      .get(`/api/records/${recordId}/export/as9102?profile=missing-profile`)
      .set("x-user-role", "Supervisor");
    expect(unknownProfile.status).toBe(400);
    expect(unknownProfile.body).toMatchObject({ error: "unknown_profile" });
  });

  it("reports non-perfect pass rate when no measurements were captured", async () => {
    const opId = await getOperationId("1234", "20");
    expect(opId).toBeTruthy();

    const operatorId = await getUserIdByName("J. Morris");
    expect(operatorId).toBeTruthy();

    const jobId = nextJobId("J-EXP-ZERO");
    const createJob = await request(app)
      .post("/api/jobs")
      .set("x-user-role", "Supervisor")
      .send({
        id: jobId,
        partId: "1234",
        partRevision: "A",
        operationId: opId,
        lot: "Lot EXP Zero",
        qty: 2,
        status: "open"
      });
    expect(createJob.status).toBe(201);

    const submit = await request(app)
      .post("/api/records")
      .set("x-user-role", "Operator")
      .send({
        jobId,
        partId: "1234",
        operationId: opId,
        lot: "Lot EXP Zero",
        qty: 2,
        operatorUserId: operatorId,
        status: "incomplete",
        oot: false,
        comment: "",
        values: [],
        tools: [],
        missingPieces: [{ pieceNumber: 1, reason: "Unable to Measure" }],
        pieceComments: []
      });
    expect(submit.status).toBe(201);
    const recordId = submit.body.id;
    expect(recordId).toBeTruthy();

    const as9102 = await request(app)
      .get(`/api/records/${recordId}/export/as9102?profile=as9102-basic`)
      .set("x-user-role", "Supervisor");
    expect(as9102.status).toBe(200);
    expect(as9102.body.input?.stats).toMatchObject({
      measured: 0,
      failed: 0,
      passRate: 0
    });
  });

  it("reports non-perfect pass rate when measurements are only partially captured", async () => {
    const fixture = await createDeterministicOperationFixture("PARTIAL");
    expect(fixture.operationId).toBeTruthy();
    expect(fixture.dimensionId).toBeTruthy();

    const operatorId = await getUserIdByName("J. Morris");
    expect(operatorId).toBeTruthy();

    const jobId = nextJobId("J-EXP-PART");
    const createJob = await request(app)
      .post("/api/jobs")
      .set("x-user-role", "Supervisor")
      .send({
        id: jobId,
        partId: fixture.partId,
        partRevision: "A",
        operationId: fixture.operationId,
        lot: "Lot EXP Partial",
        qty: 2,
        status: "open"
      });
    expect(createJob.status).toBe(201);

    const submit = await request(app)
      .post("/api/records")
      .set("x-user-role", "Operator")
      .send({
        jobId,
        partId: fixture.partId,
        operationId: fixture.operationId,
        lot: "Lot EXP Partial",
        qty: 2,
        operatorUserId: operatorId,
        status: "incomplete",
        oot: false,
        comment: "",
        values: [
          { dimensionId: fixture.dimensionId, pieceNumber: 1, value: "1.0000", isOot: false }
        ],
        tools: [],
        missingPieces: [{ pieceNumber: 2, reason: "Unable to Measure" }],
        pieceComments: []
      });
    expect(submit.status).toBe(201);
    const recordId = submit.body.id;
    expect(recordId).toBeTruthy();

    const as9102 = await request(app)
      .get(`/api/records/${recordId}/export/as9102?profile=as9102-basic`)
      .set("x-user-role", "Supervisor");
    expect(as9102.status).toBe(200);
    expect(as9102.body.input?.stats?.measured).toBe(1);
    expect(as9102.body.input?.stats?.failed).toBe(0);
    expect(as9102.body.input?.stats?.expectedMeasurements).toBe(2);
    expect(as9102.body.input?.stats?.passRate).toBeCloseTo(0.5, 6);
    expect(as9102.body.input?.stats?.passRate).toBeLessThan(1);
  });

  it("assembles characteristic-indexed balloon references and package export fixtures", async () => {
    const fixture = await createAs9102AcceptanceFixture("FAIPKG");
    const expected = readJsonFixture("as9102-package-acceptance.json");
    const operatorId = await getUserIdByName("J. Morris");
    expect(operatorId).toBeTruthy();

    const jobId = nextJobId("J-EXP-FAI");
    const createJob = await request(app)
      .post("/api/jobs")
      .set("x-user-role", "Supervisor")
      .send({
        id: jobId,
        partId: fixture.partId,
        partRevision: "A",
        operationId: fixture.operationId,
        lot: "Lot FAI Package",
        qty: 2,
        status: "open"
      });
    expect(createJob.status).toBe(201);

    const submit = await request(app)
      .post("/api/records")
      .set("x-user-role", "Operator")
      .send({
        jobId,
        partId: fixture.partId,
        operationId: fixture.operationId,
        lot: "Lot FAI Package",
        qty: 2,
        operatorUserId: operatorId,
        status: "complete",
        oot: true,
        comment: "FAI package review",
        values: [
          { dimensionId: fixture.dimensions[0].id, pieceNumber: 1, value: "1.0100", isOot: false },
          { dimensionId: fixture.dimensions[0].id, pieceNumber: 2, value: "1.2100", isOot: true },
          { dimensionId: fixture.dimensions[1].id, pieceNumber: 1, value: "31.5000", isOot: false }
        ],
        tools: [
          { dimensionId: fixture.dimensions[0].id, toolId: fixture.tools[0].id, itNum: fixture.tools[0].it_num },
          { dimensionId: fixture.dimensions[1].id, toolId: fixture.tools[1].id, itNum: fixture.tools[1].it_num }
        ],
        missingPieces: [],
        pieceComments: [
          { pieceNumber: 1, comment: "First piece balloon set", serialNumber: "SER-1" }
        ]
      });
    expect(submit.status).toBe(201);

    const as9102 = await request(app)
      .get(`/api/records/${submit.body.id}/export/as9102?profile=as9102-fixture-pack`)
      .set("x-user-role", "Supervisor");
    expect(as9102.status).toBe(200);
    expect(as9102.body.record?.partId).toBe(fixture.partId);
    expect(as9102.body.package).toMatchObject(expected.package);
    expect(as9102.body.package.forms.form1).toMatchObject({
      partNumber: fixture.partId,
      partRevision: "A",
      lot: "Lot FAI Package",
      quantity: 2,
      operationNumber: fixture.opNumber
    });
    expect(as9102.body.input?.balloonSummary).toBe("B1:#1; B2:#2");
    expect(as9102.body.input?.fixtureSummary).toContain("fixture-characteristic-balloon-index:pass");

    const packageArtifact = as9102.body.output.artifacts.find((artifact) => artifact.templateId === "fai-package-json-v1");
    expect(packageArtifact).toMatchObject(expected.packageArtifact);
    expect(as9102.body.output.artifacts.map((artifact) => artifact.templateId)).toEqual(expected.outputTemplateIds);

    const packagePayload = JSON.parse(packageArtifact.content);
    expect(packagePayload.package).toMatchObject(expected.package);
    expect(packagePayload.package.forms.form1.partNumber).toBe(fixture.partId);
  });
});
