import { Router } from "express";
import { query, transaction } from "../db.js";
import { requireCapability } from "../middleware/requireCapability.js";

const router = Router();

const VALID_ROLES = ["Operator", "Quality", "Supervisor", "Admin"];

router.get("/", requireCapability("manage_roles"), async (req, res, next) => {
  try {
    const { rows } = await query(
      "SELECT role, capability FROM role_capabilities ORDER BY role, capability",
      []
    );
    const byRole = {};
    for (const r of rows) {
      if (!byRole[r.role]) byRole[r.role] = [];
      byRole[r.role].push(r.capability);
    }
    const result = VALID_ROLES.map((role) => ({
      role,
      capabilities: byRole[role] || []
    }));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.put("/:role", requireCapability("manage_roles"), async (req, res, next) => {
  try {
    const { role } = req.params;
    const { capabilities } = req.body || {};
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: "invalid_role" });
    }
    if (!Array.isArray(capabilities)) {
      return res.status(400).json({ error: "capabilities_required" });
    }
    const uniqueCaps = [...new Set(capabilities.map(String))].filter(Boolean);
    await transaction(async (client) => {
      await client.query("DELETE FROM role_capabilities WHERE role=$1", [role]);
      if (uniqueCaps.length) {
        const values = uniqueCaps
          .map((_, i) => `($1,$${i + 2})`)
          .join(",");
        await client.query(
          `INSERT INTO role_capabilities (role, capability) VALUES ${values}`,
          [role, ...uniqueCaps]
        );
      }
    });
    const { rows } = await query(
      "SELECT role, capability FROM role_capabilities WHERE role=$1 ORDER BY capability",
      [role]
    );
    res.json({ role, capabilities: rows.map((r) => r.capability) });
  } catch (err) {
    next(err);
  }
});

export default router;
