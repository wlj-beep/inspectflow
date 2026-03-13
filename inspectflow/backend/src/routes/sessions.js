import { Router } from "express";
import { query } from "../db.js";
import { requireAnyCapability } from "../middleware/requireCapability.js";

const router = Router();

router.post("/start", requireAnyCapability(["view_operator", "view_admin"]), async (req, res, next) => {
  try {
    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ error: "user_required" });
    const { rows } = await query(
      "INSERT INTO user_sessions (user_id) VALUES ($1) RETURNING *",
      [userId]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.post("/end", requireAnyCapability(["view_operator", "view_admin"]), async (req, res, next) => {
  try {
    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ error: "user_required" });
    const { rows } = await query(
      `WITH latest AS (
         SELECT id
         FROM user_sessions
         WHERE user_id=$1 AND end_ts IS NULL
         ORDER BY start_ts DESC
         LIMIT 1
       )
       UPDATE user_sessions
       SET end_ts=NOW()
       WHERE id IN (SELECT id FROM latest)
       RETURNING *`,
      [userId]
    );
    if (!rows[0]) return res.status(404).json({ error: "no_open_session" });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

export default router;
