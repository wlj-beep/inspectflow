import { Router } from "express";
import { requireCapability } from "../middleware/requireCapability.js";
import { transaction } from "../db.js";
import {
  createMsaStudy,
  getMsaStudy,
  getMsaStudySummary,
  listMsaStudies,
  recordMsaObservations
} from "../services/quality/msa.js";

const router = Router();

function parsePositiveInteger(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

router.get("/studies", requireCapability("view_records"), async (req, res, next) => {
  try {
    const studies = await listMsaStudies({
      partId: req.query.partId,
      verdict: req.query.verdict
    });
    res.json({ count: studies.length, studies });
  } catch (err) {
    next(err);
  }
});

router.post("/studies", requireCapability("edit_records"), async (req, res, next) => {
  try {
    const created = await transaction((client) => createMsaStudy(
      {
        ...req.body,
        createdByUserId: req.auth?.user?.id || null,
        createdByRole: req.auth?.user?.role || null
      },
      client
    ));

    if (created?.error === "required_fields_missing") return res.status(400).json({ error: "required_fields_missing" });
    if (created?.error === "part_id_required") return res.status(400).json({ error: "part_id_required" });
    if (created?.error === "part_not_found") return res.status(404).json({ error: "part_not_found" });
    if (created?.error === "part_count_too_small") return res.status(400).json({ error: "part_count_too_small" });
    if (created?.error === "operator_count_too_small") return res.status(400).json({ error: "operator_count_too_small" });
    if (created?.error === "trials_per_part_too_small") return res.status(400).json({ error: "trials_per_part_too_small" });
    if (created?.error === "invalid_spec_limits") return res.status(400).json({ error: "invalid_spec_limits" });
    if (created?.error === "duplicate_operator_user_ids") return res.status(400).json({ error: "duplicate_operator_user_ids" });
    if (created?.error === "unknown_operator_user") return res.status(404).json({ error: "unknown_operator_user" });
    if (created?.error === "operator_role_required") return res.status(400).json({ error: "operator_role_required" });

    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

router.get("/studies/:id", requireCapability("view_records"), async (req, res, next) => {
  try {
    const studyId = parsePositiveInteger(req.params.id);
    if (!studyId) return res.status(400).json({ error: "invalid_study_id" });

    const detail = await getMsaStudy(studyId);
    if (!detail) return res.status(404).json({ error: "not_found" });
    res.json(detail);
  } catch (err) {
    next(err);
  }
});

router.post("/studies/:id/observations", requireCapability("edit_records"), async (req, res, next) => {
  try {
    const studyId = parsePositiveInteger(req.params.id);
    if (!studyId) return res.status(400).json({ error: "invalid_study_id" });

    const result = await transaction((client) => recordMsaObservations(
      studyId,
      {
        ...req.body,
        createdByUserId: req.auth?.user?.id || null,
        createdByRole: req.auth?.user?.role || null
      },
      client
    ));

    if (result?.error === "study_not_found") return res.status(404).json({ error: "study_not_found" });
    if (result?.error === "required_fields_missing") return res.status(400).json({ error: "required_fields_missing" });
    if (result?.error === "part_out_of_range") return res.status(400).json({ error: "part_out_of_range" });
    if (result?.error === "operator_not_in_study") return res.status(400).json({ error: "operator_not_in_study" });
    if (result?.error === "trial_out_of_range") return res.status(400).json({ error: "trial_out_of_range" });

    res.status(201).json(result);
  } catch (err) {
    if (String(err?.code || "") === "23505") {
      return res.status(409).json({ error: "duplicate_observation" });
    }
    next(err);
  }
});

router.get("/studies/:id/summary", requireCapability("view_records"), async (req, res, next) => {
  try {
    const studyId = parsePositiveInteger(req.params.id);
    if (!studyId) return res.status(400).json({ error: "invalid_study_id" });

    const result = await getMsaStudySummary(studyId);
    if (!result) return res.status(404).json({ error: "not_found" });
    if (result?.error === "study_not_ready_for_analysis") {
      return res.status(409).json({ error: "study_not_ready_for_analysis", ...result });
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
