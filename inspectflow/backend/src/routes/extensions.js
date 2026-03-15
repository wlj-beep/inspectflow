import { Router } from "express";
import { requireCapability } from "../middleware/requireCapability.js";
import { getActorRole, getActorUserId } from "../middleware/authSession.js";
import {
  enablePlugin,
  getRuntimeBoundary,
  isPluginIdValid,
  listRegisteredPlugins,
  registerPluginManifest
} from "../services/platform/extensionRuntime.js";

const router = Router();

function ensureAdmin(req, res) {
  const role = getActorRole(req);
  if (role !== "Admin") {
    res.status(403).json({ error: "forbidden" });
    return false;
  }
  return true;
}

function actorFromRequest(req) {
  return {
    userId: getActorUserId(req),
    role: getActorRole(req)
  };
}

router.get("/runtime", requireCapability("view_admin"), async (req, res, next) => {
  try {
    if (!ensureAdmin(req, res)) return;
    res.json(getRuntimeBoundary());
  } catch (err) {
    next(err);
  }
});

router.get("/plugins", requireCapability("view_admin"), async (req, res, next) => {
  try {
    if (!ensureAdmin(req, res)) return;
    res.json(await listRegisteredPlugins());
  } catch (err) {
    next(err);
  }
});

router.post("/plugins", requireCapability("view_admin"), async (req, res, next) => {
  try {
    if (!ensureAdmin(req, res)) return;
    const manifest = req.body || {};
    const pluginId = String(manifest.pluginId || manifest.id || "").trim();
    if (!isPluginIdValid(pluginId)) {
      return res.status(400).json({ error: "invalid_plugin_id" });
    }
    const result = await registerPluginManifest({
      manifest,
      actor: actorFromRequest(req)
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post("/plugins/:pluginId/enable", requireCapability("view_admin"), async (req, res, next) => {
  try {
    if (!ensureAdmin(req, res)) return;
    const pluginId = String(req.params.pluginId || "").trim();
    if (!isPluginIdValid(pluginId)) {
      return res.status(400).json({ error: "invalid_plugin_id" });
    }

    const result = await enablePlugin({
      pluginId,
      actor: actorFromRequest(req)
    });

    if (result.error === "not_found") return res.status(404).json({ error: "not_found" });
    if (result.error === "runtime_disabled") return res.status(409).json({ error: "runtime_disabled" });
    if (result.error === "module_disabled") return res.status(409).json({ error: "module_disabled" });
    if (result.error === "policy_blocked") return res.status(409).json({ error: "policy_blocked" });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
