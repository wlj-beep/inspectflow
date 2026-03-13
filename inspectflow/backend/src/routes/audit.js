import { Router } from "express";
import { query } from "../db.js";
import { requireCapability } from "../middleware/requireCapability.js";

const router = Router();

router.get("/", requireCapability("view_records"), async (req, res, next) => {
  try {
    const { recordId } = req.query;
    const { rows } = await query(
      recordId
        ? "SELECT * FROM audit_log WHERE record_id=$1 ORDER BY timestamp DESC"
        : "SELECT * FROM audit_log ORDER BY timestamp DESC",
      recordId ? [recordId] : []
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

export default router;
