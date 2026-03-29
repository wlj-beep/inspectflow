import crypto from "node:crypto";
import request from "supertest";
import app from "../../src/index.js";
import { query } from "../../src/db.js";

export function nextJobId(prefix) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

export function nextPartId(prefix = "P-REV") {
  return `${prefix}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
}

export async function getOperationId(partId, opNumber) {
  const { rows } = await query(
    "SELECT id FROM operations WHERE part_id=$1 AND op_number=$2 LIMIT 1",
    [partId, opNumber]
  );
  return rows[0]?.id;
}

export async function requireOperationId(partId, opNumber) {
  const operationId = await getOperationId(partId, opNumber);
  if (!operationId) {
    throw new Error(`Operation ${opNumber} not found for part ${partId}`);
  }
  return operationId;
}

export async function createJob({ id, partId, partRevision = "A", operationId, lot = "Lot T", qty = 5, status = "open", role = "Supervisor" }) {
  return request(app)
    .post("/api/jobs")
    .set("x-user-role", role)
    .send({ id, partId, partRevision, operationId, lot, qty, status });
}

export async function getFirstDimensionId(operationId) {
  const { rows } = await query(
    "SELECT id FROM dimensions WHERE operation_id=$1 ORDER BY id ASC LIMIT 1",
    [operationId]
  );
  return rows[0]?.id;
}

export async function getDimensionIdByName(operationId, name) {
  const { rows } = await query(
    "SELECT id FROM dimensions WHERE operation_id=$1 AND name=$2 LIMIT 1",
    [operationId, name]
  );
  return rows[0]?.id;
}

export async function getToolIdByName(name) {
  const { rows } = await query(
    "SELECT id FROM tools WHERE name=$1 LIMIT 1",
    [name]
  );
  return rows[0]?.id;
}

export async function getUserIdByName(name) {
  const { rows } = await query(
    "SELECT id FROM users WHERE name=$1 LIMIT 1",
    [name]
  );
  return rows[0]?.id;
}

export function buildBaseRecordPayload({
  jobId,
  operationId,
  lot,
  qty,
  partId = "1234",
  operatorUserId = 1,
  status = "incomplete",
  oot = false,
  comment = "",
  values = [],
  tools = [],
  missingPieces = []
}) {
  return {
    jobId,
    partId,
    operationId,
    lot,
    qty,
    operatorUserId,
    status,
    oot,
    comment,
    values,
    tools,
    missingPieces
  };
}
