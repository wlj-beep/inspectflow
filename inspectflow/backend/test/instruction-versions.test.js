import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import request from "supertest";
import app from "../src/index.js";
import { query } from "../src/db.js";

function nextId(prefix) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

async function getUserIdByName(name) {
  const { rows } = await query("SELECT id FROM users WHERE name=$1 LIMIT 1", [name]);
  return rows[0]?.id;
}

function authedRequest(role, userId = null) {
  const agent = request(app);
  return {
    get(path) {
      const req = agent.get(path).set("x-user-role", role);
      if (userId) req.set("x-user-id", String(userId));
      return req;
    },
    post(path) {
      const req = agent.post(path).set("x-user-role", role);
      if (userId) req.set("x-user-id", String(userId));
      return req;
    },
    put(path) {
      const req = agent.put(path).set("x-user-role", role);
      if (userId) req.set("x-user-id", String(userId));
      return req;
    }
  };
}

async function createInstructionFixture() {
  const adminId = await getUserIdByName("S. Admin");
  const supervisorId = await getUserIdByName("D. Kowalski");
  const operatorId = await getUserIdByName("J. Morris");
  expect(adminId).toBeTruthy();
  expect(supervisorId).toBeTruthy();
  expect(operatorId).toBeTruthy();

  const admin = authedRequest("Admin", adminId);
  const supervisor = authedRequest("Supervisor", supervisorId);
  const operator = authedRequest("Operator", operatorId);

  const partId = nextId("P-INSTR");
  const createPart = await admin
    .post("/api/parts")
    .send({ id: partId, description: `Instruction test ${partId}`, revision: "A" });
  expect(createPart.status).toBe(201);

  const createOperation = await admin
    .post("/api/operations")
    .send({ partId, opNumber: "010", label: "Instruction Op" });
  expect(createOperation.status).toBe(201);
  const operationId = Number(createOperation.body.id);

  const dimInsert = await query(
    `INSERT INTO dimensions (operation_id, name, nominal, tol_plus, tol_minus, unit, sampling)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id`,
    [operationId, "Instruction Check", 1.25, 0.01, 0.01, "in", "100pct"]
  );
  const dimensionId = Number(dimInsert.rows[0].id);

  const jobId = nextId("J-INSTR");
  const createJob = await supervisor
    .post("/api/jobs")
    .send({
      id: jobId,
      partId,
      partRevision: "A",
      operationId,
      lot: "LOT-INSTR",
      qty: 1,
      status: "open"
    });
  expect(createJob.status).toBe(201);

  return {
    admin,
    supervisor,
    operator,
    adminId,
    supervisorId,
    operatorId,
    partId,
    operationId,
    dimensionId,
    jobId
  };
}

describe("Instruction version workflows", () => {
  it("creates, updates, publishes, lists, fetches active instructions, and tracks acknowledgments", async () => {
    const {
      supervisor,
      supervisorId,
      operator,
      operatorId,
      operationId,
      dimensionId,
      jobId,
      partId
    } = await createInstructionFixture();

    const createV1 = await supervisor
      .post(`/api/operations/${operationId}/instructions/versions`)
      .send({
        userId: supervisorId,
        title: "Setup v1",
        content: "Check chuck pressure before measurement.",
        changeSummary: "Initial release",
        publish: true,
        mediaLinks: [
          {
            label: "Procedure Video",
            url: "https://example.com/procedure-v1.mp4",
            mediaType: "video",
            sortOrder: 0
          }
        ]
      });
    expect(createV1.status).toBe(201);
    expect(createV1.body).toMatchObject({
      operationId,
      versionNumber: 1,
      status: "published",
      title: "Setup v1"
    });

    const createV2 = await supervisor
      .post(`/api/operations/${operationId}/instructions/versions`)
      .send({
        userId: supervisorId,
        title: "Setup v2 draft",
        content: "Draft procedure update.",
        changeSummary: "Expanded checks",
        mediaLinks: [
          {
            label: "Reference Photo",
            url: "https://example.com/photo-v2.png",
            mediaType: "image",
            sortOrder: 0
          }
        ]
      });
    expect(createV2.status).toBe(201);
    expect(createV2.body).toMatchObject({
      operationId,
      versionNumber: 2,
      status: "draft"
    });

    const updateV2 = await supervisor
      .put(`/api/operations/${operationId}/instructions/versions/${createV2.body.id}`)
      .send({
        content: "Draft procedure update with final torque check.",
        mediaLinks: [
          {
            label: "Reference Photo",
            url: "https://example.com/photo-v2.png",
            mediaType: "image",
            sortOrder: 0
          },
          {
            label: "Checklist PDF",
            url: "https://example.com/checklist-v2.pdf",
            mediaType: "document",
            sortOrder: 1
          }
        ]
      });
    expect(updateV2.status).toBe(200);
    expect(updateV2.body.content).toContain("final torque check");
    expect(updateV2.body.mediaLinks).toHaveLength(2);

    const historyBeforePublish = await supervisor.get(`/api/operations/${operationId}/instructions`);
    expect(historyBeforePublish.status).toBe(200);
    expect(historyBeforePublish.body.current.id).toBe(createV1.body.id);
    expect(historyBeforePublish.body.versions.map((version) => version.versionNumber)).toEqual([2, 1]);

    const publishV2 = await supervisor
      .post(`/api/operations/${operationId}/instructions/versions/${createV2.body.id}/publish`)
      .send({ userId: supervisorId });
    expect(publishV2.status).toBe(200);
    expect(publishV2.body).toMatchObject({
      id: createV2.body.id,
      status: "published",
      versionNumber: 2
    });

    const historyAfterPublish = await supervisor.get(`/api/operations/${operationId}/instructions`);
    expect(historyAfterPublish.status).toBe(200);
    expect(historyAfterPublish.body.current.id).toBe(createV2.body.id);
    expect(historyAfterPublish.body.versions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: createV2.body.id, status: "published" }),
        expect.objectContaining({ id: createV1.body.id, status: "superseded" })
      ])
    );

    const activeJobInstructions = await operator.get(`/api/jobs/${jobId}/instructions/active`);
    expect(activeJobInstructions.status).toBe(200);
    expect(activeJobInstructions.body).toMatchObject({
      context: {
        type: "job",
        jobId,
        operationId
      },
      operation: {
        id: operationId,
        partId,
        opNumber: "010",
        label: "Instruction Op"
      },
      instruction: {
        id: createV2.body.id,
        versionNumber: 2,
        status: "published"
      },
      acknowledgment: null
    });
    expect(activeJobInstructions.body.instruction.mediaLinks).toHaveLength(2);

    const acknowledgeJob = await operator
      .post(`/api/jobs/${jobId}/instructions/acknowledgments`)
      .send({
        operatorUserId: operatorId,
        instructionVersionId: createV2.body.id
      });
    expect(acknowledgeJob.status).toBe(201);
    expect(acknowledgeJob.body).toMatchObject({
      created: true,
      context: {
        type: "job",
        jobId
      },
      acknowledgment: {
        contextType: "job",
        jobId,
        operatorUserId: operatorId
      }
    });

    const acknowledgeJobAgain = await operator
      .post(`/api/jobs/${jobId}/instructions/acknowledgments`)
      .send({
        operatorUserId: operatorId,
        instructionVersionId: createV2.body.id
      });
    expect(acknowledgeJobAgain.status).toBe(200);
    expect(acknowledgeJobAgain.body.created).toBe(false);

    const createRecord = await operator
      .post("/api/records")
      .send({
        jobId,
        partId,
        operationId,
        lot: "LOT-INSTR",
        qty: 1,
        operatorUserId: operatorId,
        status: "complete",
        oot: false,
        values: [
          {
            dimensionId,
            pieceNumber: 1,
            value: "1.2501",
            isOot: false
          }
        ],
        tools: [],
        missingPieces: [],
        pieceComments: [],
        attachments: []
      });
    expect(createRecord.status).toBe(201);
    const recordId = Number(createRecord.body.id);

    const activeRecordInstructions = await operator.get(`/api/records/${recordId}/instructions/active`);
    expect(activeRecordInstructions.status).toBe(200);
    expect(activeRecordInstructions.body).toMatchObject({
      context: {
        type: "record",
        jobId,
        recordId,
        operationId
      },
      instruction: {
        id: createV2.body.id,
        versionNumber: 2
      },
      acknowledgment: null
    });

    const acknowledgeRecord = await operator
      .post(`/api/records/${recordId}/instructions/acknowledgments`)
      .send({
        operatorUserId: operatorId,
        instructionVersionId: createV2.body.id
      });
    expect(acknowledgeRecord.status).toBe(201);
    expect(acknowledgeRecord.body).toMatchObject({
      created: true,
      acknowledgment: {
        contextType: "record",
        recordId,
        operatorUserId: operatorId
      }
    });
  });

  it("enforces management and acknowledgment auth boundaries", async () => {
    const {
      supervisor,
      supervisorId,
      operator,
      operatorId,
      operationId,
      jobId
    } = await createInstructionFixture();

    const operatorCreate = await operator
      .post(`/api/operations/${operationId}/instructions/versions`)
      .send({
        operatorUserId: operatorId,
        title: "Blocked draft",
        content: "Operators should not manage versions.",
        mediaLinks: []
      });
    expect(operatorCreate.status).toBe(403);
    expect(operatorCreate.body).toMatchObject({ error: "forbidden" });

    const publishable = await supervisor
      .post(`/api/operations/${operationId}/instructions/versions`)
      .send({
        userId: supervisorId,
        title: "Supervisor release",
        content: "Published for operator review.",
        publish: true,
        mediaLinks: []
      });
    expect(publishable.status).toBe(201);

    const supervisorAck = await supervisor
      .post(`/api/jobs/${jobId}/instructions/acknowledgments`)
      .send({
        operatorUserId: operatorId,
        instructionVersionId: publishable.body.id
      });
    expect(supervisorAck.status).toBe(403);
    expect(supervisorAck.body).toMatchObject({ error: "forbidden" });

    const operatorHistory = await operator.get(`/api/operations/${operationId}/instructions`);
    expect(operatorHistory.status).toBe(403);
    expect(operatorHistory.body).toMatchObject({ error: "forbidden" });
  });

  it("rejects caller-supplied role field in acknowledgment payload (BL-169)", async () => {
    const { operator, operatorId, supervisor, supervisorId, operationId, jobId } = await createInstructionFixture();

    const published = await supervisor
      .post(`/api/operations/${operationId}/instructions/versions`)
      .send({ userId: supervisorId, title: "Role guard test", content: "Published.", publish: true, mediaLinks: [] });
    expect(published.status).toBe(201);

    const withRole = await operator
      .post(`/api/jobs/${jobId}/instructions/acknowledgments`)
      .send({ operatorUserId: operatorId, instructionVersionId: published.body.id, role: "Admin" });
    expect(withRole.status).toBe(400);
    expect(withRole.body).toMatchObject({ error: "role_field_not_allowed" });

    const withActorRole = await operator
      .post(`/api/jobs/${jobId}/instructions/acknowledgments`)
      .send({ operatorUserId: operatorId, instructionVersionId: published.body.id, actorRole: "Admin" });
    expect(withActorRole.status).toBe(400);
    expect(withActorRole.body).toMatchObject({ error: "role_field_not_allowed" });

    const legitimateAck = await operator
      .post(`/api/jobs/${jobId}/instructions/acknowledgments`)
      .send({ operatorUserId: operatorId, instructionVersionId: published.body.id });
    expect(legitimateAck.status).toBe(201);
    expect(legitimateAck.body.acknowledgment.acknowledgedRole).toBe("Operator");
  });

  it("serializes concurrent publishes so exactly one version remains published", async () => {
    const {
      supervisor,
      supervisorId,
      operationId
    } = await createInstructionFixture();

    const publishV1 = await supervisor
      .post(`/api/operations/${operationId}/instructions/versions`)
      .send({
        userId: supervisorId,
        title: "Concurrent v1",
        content: "Initial published baseline.",
        publish: true,
        mediaLinks: []
      });
    expect(publishV1.status).toBe(201);

    const createV2 = await supervisor
      .post(`/api/operations/${operationId}/instructions/versions`)
      .send({
        userId: supervisorId,
        title: "Concurrent v2",
        content: "Draft v2",
        mediaLinks: []
      });
    expect(createV2.status).toBe(201);

    const createV3 = await supervisor
      .post(`/api/operations/${operationId}/instructions/versions`)
      .send({
        userId: supervisorId,
        title: "Concurrent v3",
        content: "Draft v3",
        mediaLinks: []
      });
    expect(createV3.status).toBe(201);

    const [publishV2, publishV3] = await Promise.all([
      supervisor
        .post(`/api/operations/${operationId}/instructions/versions/${createV2.body.id}/publish`)
        .send({ userId: supervisorId }),
      supervisor
        .post(`/api/operations/${operationId}/instructions/versions/${createV3.body.id}/publish`)
        .send({ userId: supervisorId })
    ]);
    expect([publishV2.status, publishV3.status]).toEqual([200, 200]);

    const { rows } = await query(
      `SELECT v.id, v.status
       FROM operation_instruction_versions v
       JOIN operation_instruction_sets s ON s.id = v.instruction_set_id
       WHERE s.operation_id=$1`,
      [operationId]
    );
    const published = rows.filter((row) => row.status === "published");
    expect(published).toHaveLength(1);
    expect([Number(createV2.body.id), Number(createV3.body.id)]).toContain(Number(published[0].id));
  });
});
