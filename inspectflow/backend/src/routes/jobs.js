import { Router } from "express";
import { query, transaction } from "../db.js";
import { getRoleCaps, requireAnyCapability, requireCapability } from "../middleware/requireCapability.js";
import { ensurePartSetupBaselineRevision, getPartRevisionByCode } from "../revisions.js";

const router = Router();

function normalizePartRevision(value) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  return normalized || null;
}

function requestRole(req) {
  return String(req.header("x-user-role") || "").trim() || null;
}

async function validatePartRevision(client, partId, revisionCode, role) {
  await ensurePartSetupBaselineRevision(client, { partId, changedByRole: role });
  const revision = await getPartRevisionByCode(client, partId, revisionCode);
  return !!revision;
}

router.get("/", requireAnyCapability(["view_operator", "view_jobs", "manage_jobs", "view_admin"]), async (req, res, next) => {
  try {
    const { status, partId, operationId, partRevision } = req.query;
    const filters = [];
    const params = [];
    if (status) { params.push(status); filters.push(`status=$${params.length}`); }
    if (partId) { params.push(partId); filters.push(`part_id=$${params.length}`); }
    if (operationId) { params.push(operationId); filters.push(`operation_id=$${params.length}`); }
    if (partRevision) { params.push(normalizePartRevision(partRevision)); filters.push(`part_revision_code=$${params.length}`); }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

    const { rows } = await query(
      `SELECT * FROM jobs ${where} ORDER BY id DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get("/:id", requireAnyCapability(["view_operator", "view_jobs", "manage_jobs", "view_admin"]), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows } = await query("SELECT * FROM jobs WHERE id=$1", [id]);
    if (!rows[0]) return res.status(404).json({ error: "not_found" });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.post("/", requireCapability("manage_jobs"), async (req, res, next) => {
  try {
    const { id, partId, partRevision, partRevisionCode, revision, operationId, lot, qty, status = "open" } = req.body;
    const trimmedId = String(id || "").trim();
    const trimmedPart = String(partId || "").trim();
    const trimmedRevision = normalizePartRevision(partRevision || partRevisionCode || revision);
    const trimmedLot = String(lot || "").trim();
    const qtyNum = Number(qty);
    if (!trimmedId || !trimmedPart || !trimmedRevision || !operationId || !trimmedLot || Number.isNaN(qtyNum) || qtyNum <= 0) {
      return res.status(400).json({ error: "required_fields_missing" });
    }
    if (!["open", "closed", "draft", "incomplete"].includes(status)) {
      return res.status(400).json({ error: "invalid_status" });
    }

    const role = requestRole(req);
    const created = await transaction(async (client) => {
      const hasRevision = await validatePartRevision(client, trimmedPart, trimmedRevision, role);
      if (!hasRevision) return { error: "part_revision_not_found" };

      const opRes = await client.query(
        "SELECT id FROM operations WHERE id=$1 AND part_id=$2",
        [operationId, trimmedPart]
      );
      if (!opRes.rows[0]) {
        return { error: "operation_part_mismatch" };
      }
      const rowsRes = await client.query(
        `INSERT INTO jobs (id, part_id, part_revision_code, operation_id, lot, qty, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [trimmedId, trimmedPart, trimmedRevision, operationId, trimmedLot, qtyNum, status]
      );
      return rowsRes.rows[0];
    });

    if (created?.error === "part_revision_not_found") {
      return res.status(400).json({ error: "part_revision_not_found" });
    }
    if (created?.error === "operation_part_mismatch") {
      return res.status(400).json({ error: "operation_part_mismatch" });
    }
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

router.put("/:id", requireCapability("manage_jobs"), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { partId, partRevision, partRevisionCode, revision, operationId, lot, qty, status } = req.body;
    const trimmedPart = String(partId || "").trim();
    const trimmedRevision = normalizePartRevision(partRevision || partRevisionCode || revision);
    const trimmedLot = String(lot || "").trim();
    const qtyNum = Number(qty);
    if (!trimmedPart || !trimmedRevision || !operationId || !trimmedLot || Number.isNaN(qtyNum) || qtyNum <= 0 || !status) {
      return res.status(400).json({ error: "required_fields_missing" });
    }
    if (!["open", "closed", "draft", "incomplete"].includes(status)) {
      return res.status(400).json({ error: "invalid_status" });
    }

    const role = requestRole(req);
    const updated = await transaction(async (client) => {
      const hasRevision = await validatePartRevision(client, trimmedPart, trimmedRevision, role);
      if (!hasRevision) return { error: "part_revision_not_found" };

      const opRes = await client.query(
        "SELECT id FROM operations WHERE id=$1 AND part_id=$2",
        [operationId, trimmedPart]
      );
      if (!opRes.rows[0]) {
        return { error: "operation_part_mismatch" };
      }
      const rowsRes = await client.query(
        `UPDATE jobs SET part_id=$1, part_revision_code=$2, operation_id=$3, lot=$4, qty=$5, status=$6
         WHERE id=$7 RETURNING *`,
        [trimmedPart, trimmedRevision, operationId, trimmedLot, qtyNum, status, id]
      );
      if (!rowsRes.rows[0]) return { error: "not_found" };
      return rowsRes.rows[0];
    });

    if (updated?.error === "part_revision_not_found") {
      return res.status(400).json({ error: "part_revision_not_found" });
    }
    if (updated?.error === "operation_part_mismatch") {
      return res.status(400).json({ error: "operation_part_mismatch" });
    }
    if (updated?.error === "not_found") return res.status(404).json({ error: "not_found" });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.post("/:id/lock", requireAnyCapability(["submit_records", "manage_jobs"]), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ error: "user_required" });

    const result = await transaction(async (client) => {
      const jobRes = await client.query("SELECT * FROM jobs WHERE id=$1 FOR UPDATE", [id]);
      const job = jobRes.rows[0];
      if (!job) return { error: "not_found" };
      if (!["open", "draft"].includes(job.status)) return { error: "job_not_open" };
      if (job.lock_owner_user_id && job.lock_owner_user_id !== Number(userId)) {
        return { error: "locked", lockOwnerUserId: job.lock_owner_user_id };
      }
      await client.query(
        "UPDATE jobs SET lock_owner_user_id=$1, lock_timestamp=NOW() WHERE id=$2",
        [userId, id]
      );
      return { ok: true };
    });

    if (result?.error === "not_found") return res.status(404).json({ error: "not_found" });
    if (result?.error === "job_not_open") return res.status(409).json({ error: "job_not_open" });
    if (result?.error === "locked") return res.status(409).json(result);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/unlock", requireAnyCapability(["submit_records", "manage_jobs"]), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { userId } = req.body || {};
    const caps = await getRoleCaps(req);
    const canManage = caps.includes("manage_jobs");

    const result = await transaction(async (client) => {
      const jobRes = await client.query("SELECT * FROM jobs WHERE id=$1 FOR UPDATE", [id]);
      const job = jobRes.rows[0];
      if (!job) return { error: "not_found" };
      if (canManage) {
        await client.query(
          "UPDATE jobs SET lock_owner_user_id=NULL, lock_timestamp=NULL WHERE id=$1",
          [id]
        );
        return { ok: true, forced: true };
      }
      if (!userId) return { error: "user_required" };
      if (!job.lock_owner_user_id) return { error: "not_locked" };
      if (job.lock_owner_user_id !== Number(userId)) return { error: "lock_mismatch" };
      await client.query(
        "UPDATE jobs SET lock_owner_user_id=NULL, lock_timestamp=NULL WHERE id=$1",
        [id]
      );
      return { ok: true };
    });

    if (result?.error === "not_found") return res.status(404).json({ error: "not_found" });
    if (result?.error === "user_required") return res.status(400).json({ error: "user_required" });
    if (result?.error === "not_locked") return res.status(409).json({ error: "not_locked" });
    if (result?.error === "lock_mismatch") return res.status(409).json({ error: "lock_mismatch" });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", requireCapability("manage_jobs"), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows } = await query("DELETE FROM jobs WHERE id=$1 RETURNING id", [id]);
    if (!rows[0]) return res.status(404).json({ error: "not_found" });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
