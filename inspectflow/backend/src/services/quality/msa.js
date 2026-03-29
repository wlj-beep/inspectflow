import { query as rootQuery } from "../../db.js";

const VALID_ROLES = new Set(["Operator", "Quality", "Supervisor", "Admin"]);

let schemaInitPromise = null;

function dbQuery(db, text, params) {
  return db.query(text, params);
}

function parsePositiveInteger(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function parseFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeText(value) {
  const trimmed = String(value ?? "").trim();
  return trimmed.length ? trimmed : null;
}

function normalizeOptionalNumber(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeOperatorIds(value) {
  const raw = Array.isArray(value) ? value : [];
  const seen = new Set();
  const ids = [];
  for (const item of raw) {
    const id = parsePositiveInteger(item);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function roundMetric(value, digits = 6) {
  if (value == null || !Number.isFinite(value)) return null;
  const rounded = Number(value.toFixed(digits));
  return Object.is(rounded, -0) ? 0 : rounded;
}

function buildStudyAliases(payload = {}) {
  const title = normalizeText(payload.title ?? payload.studyName ?? payload.name);
  const characteristicName = normalizeText(
    payload.characteristicName ?? payload.characteristic ?? payload.featureName ?? payload.gageCharacteristic
  );
  const unit = normalizeText(payload.unit ?? payload.units ?? payload.measurementUnit);
  const partId = normalizeText(payload.partId ?? payload.part);
  const lowerSpec = normalizeOptionalNumber(payload.lowerSpec ?? payload.lsl ?? payload.lowerSpecification);
  const upperSpec = normalizeOptionalNumber(payload.upperSpec ?? payload.usl ?? payload.upperSpecification);
  const targetValue = normalizeOptionalNumber(payload.targetValue ?? payload.target ?? payload.nominal);
  const partCount = parsePositiveInteger(payload.partCount ?? payload.parts ?? payload.sampleCount);
  const operatorUserIds = normalizeOperatorIds(
    payload.operatorUserIds ?? payload.operatorIds ?? payload.operators ?? payload.operatorUserIdList
  );
  const trialsPerPart = parsePositiveInteger(
    payload.trialsPerPart ?? payload.trials ?? payload.replicates ?? payload.measurementsPerPart
  );
  const notes = normalizeText(payload.notes ?? payload.note);

  return {
    title,
    characteristicName,
    unit,
    partId,
    lowerSpec,
    upperSpec,
    targetValue,
    partCount,
    operatorUserIds,
    trialsPerPart,
    notes
  };
}

function buildObservationAliases(payload = {}) {
  const partNumber = parsePositiveInteger(payload.partNumber ?? payload.part ?? payload.partIndex);
  const operatorUserId = parsePositiveInteger(payload.operatorUserId ?? payload.operatorId ?? payload.operator);
  const trialNumber = parsePositiveInteger(payload.trialNumber ?? payload.trial ?? payload.replicate);
  const measurement = parseFiniteNumber(payload.measurement ?? payload.value ?? payload.result ?? payload.actual);
  const notes = normalizeText(payload.notes ?? payload.note);

  return {
    partNumber,
    operatorUserId,
    trialNumber,
    measurement,
    notes
  };
}

async function ensureSchema() {
  if (schemaInitPromise) return schemaInitPromise;

  schemaInitPromise = (async () => {
    // The baseline lives entirely in this module, so we create its tables lazily
    // instead of editing the canonical schema.sql checked into the repo.
    await rootQuery(`
      CREATE TABLE IF NOT EXISTS msa_studies (
        id BIGSERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        part_id TEXT REFERENCES parts(id) ON DELETE SET NULL,
        characteristic_name TEXT NOT NULL,
        unit TEXT NOT NULL,
        lower_spec NUMERIC,
        upper_spec NUMERIC,
        target_value NUMERIC,
        part_count INTEGER NOT NULL CHECK (part_count > 0),
        operator_count INTEGER NOT NULL CHECK (operator_count > 0),
        trials_per_part INTEGER NOT NULL CHECK (trials_per_part > 0),
        operator_user_ids_json JSONB NOT NULL DEFAULT '[]'::JSONB,
        notes TEXT,
        summary_json JSONB NOT NULL DEFAULT '{}'::JSONB,
        verdict TEXT CHECK (verdict IN ('pass', 'marginal', 'fail')),
        created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_by_role TEXT CHECK (created_by_role IS NULL OR created_by_role IN ('Operator', 'Quality', 'Supervisor', 'Admin')),
        computed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await rootQuery(`
      CREATE TABLE IF NOT EXISTS msa_measurements (
        id BIGSERIAL PRIMARY KEY,
        study_id BIGINT NOT NULL REFERENCES msa_studies(id) ON DELETE CASCADE,
        part_number INTEGER NOT NULL CHECK (part_number > 0),
        operator_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        trial_number INTEGER NOT NULL CHECK (trial_number > 0),
        measurement NUMERIC NOT NULL,
        notes TEXT,
        created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_by_role TEXT CHECK (created_by_role IS NULL OR created_by_role IN ('Operator', 'Quality', 'Supervisor', 'Admin')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (study_id, part_number, operator_user_id, trial_number)
      )
    `);
    await rootQuery(
      `CREATE INDEX IF NOT EXISTS idx_msa_studies_created_at
       ON msa_studies (created_at DESC, id DESC)`
    );
    await rootQuery(
      `CREATE INDEX IF NOT EXISTS idx_msa_measurements_study
       ON msa_measurements (study_id, part_number, operator_user_id, trial_number)`
    );
  })();

  return schemaInitPromise;
}

function shapeStudyRow(row) {
  return {
    id: Number(row.id),
    title: row.title,
    partId: row.part_id || null,
    characteristicName: row.characteristic_name,
    unit: row.unit,
    lowerSpec: row.lower_spec == null ? null : Number(row.lower_spec),
    upperSpec: row.upper_spec == null ? null : Number(row.upper_spec),
    targetValue: row.target_value == null ? null : Number(row.target_value),
    partCount: Number(row.part_count),
    operatorCount: Number(row.operator_count),
    trialsPerPart: Number(row.trials_per_part),
    operatorUserIds: Array.isArray(row.operator_user_ids_json)
      ? row.operator_user_ids_json.map((value) => Number(value))
      : [],
    notes: row.notes || null,
    verdict: row.verdict || null,
    summary: row.summary_json && Object.keys(row.summary_json).length ? row.summary_json : null,
    observationCount: Number(row.observation_count || 0),
    createdByUserId: row.created_by_user_id == null ? null : Number(row.created_by_user_id),
    createdByRole: row.created_by_role || null,
    computedAt: row.computed_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function shapeObservationRow(row) {
  return {
    id: Number(row.id),
    studyId: Number(row.study_id),
    partNumber: Number(row.part_number),
    operatorUserId: Number(row.operator_user_id),
    trialNumber: Number(row.trial_number),
    measurement: Number(row.measurement),
    notes: row.notes || null,
    createdByUserId: row.created_by_user_id == null ? null : Number(row.created_by_user_id),
    createdByRole: row.created_by_role || null,
    createdAt: row.created_at
  };
}

async function loadStudyRecord(db, studyId, { forUpdate = false } = {}) {
  if (forUpdate) {
    const { rows } = await dbQuery(
      db,
      `SELECT *
       FROM msa_studies
       WHERE id = $1
       FOR UPDATE`,
      [studyId]
    );
    if (!rows[0]) return null;
    const observationCount = await dbQuery(
      db,
      `SELECT COUNT(*)::INT AS observation_count
       FROM msa_measurements
       WHERE study_id = $1`,
      [studyId]
    );
    return { ...rows[0], observation_count: observationCount.rows[0]?.observation_count || 0 };
  }

  const { rows } = await dbQuery(
    db,
    `SELECT s.*,
            COALESCE(o.observation_count, 0)::INT AS observation_count
     FROM msa_studies s
     LEFT JOIN (
       SELECT study_id, COUNT(*)::INT AS observation_count
       FROM msa_measurements
       GROUP BY study_id
     ) o ON o.study_id = s.id
     WHERE s.id = $1${forUpdate ? " FOR UPDATE" : ""}`,
    [studyId]
  );
  return rows[0] || null;
}

async function loadStudyObservations(db, studyId) {
  const { rows } = await dbQuery(
    db,
    `SELECT id, study_id, part_number, operator_user_id, trial_number, measurement,
            notes, created_by_user_id, created_by_role, created_at
     FROM msa_measurements
     WHERE study_id = $1
     ORDER BY part_number ASC, operator_user_id ASC, trial_number ASC, id ASC`,
    [studyId]
  );
  return rows.map(shapeObservationRow);
}

function normalizeStudyForSummary(studyRow) {
  const rawOperatorIds =
    studyRow.operator_user_ids_json ??
    studyRow.operatorUserIds ??
    studyRow.operator_user_ids ??
    [];
  const operatorUserIds = Array.isArray(rawOperatorIds)
    ? rawOperatorIds.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0)
    : [];
  return {
    id: Number(studyRow.id),
    title: studyRow.title,
    partId: studyRow.part_id || null,
    characteristicName: studyRow.characteristic_name,
    unit: studyRow.unit,
    lowerSpec: studyRow.lower_spec == null ? null : Number(studyRow.lower_spec),
    upperSpec: studyRow.upper_spec == null ? null : Number(studyRow.upper_spec),
    targetValue: studyRow.target_value == null ? null : Number(studyRow.target_value),
    partCount: Number(studyRow.part_count ?? studyRow.partCount),
    operatorCount: Number(studyRow.operator_count ?? studyRow.operatorCount ?? operatorUserIds.length),
    trialsPerPart: Number(studyRow.trials_per_part ?? studyRow.trialsPerPart),
    operatorUserIds,
    notes: studyRow.notes || null
  };
}

function classifyVerdict(percentStudyVariation) {
  // Deterministic baseline buckets:
  // - pass: <= 10% of total study variation
  // - marginal: > 10% and <= 30%
  // - fail: > 30%
  if (percentStudyVariation <= 10) return "pass";
  if (percentStudyVariation <= 30) return "marginal";
  return "fail";
}

function componentSummary({ ss, df, ms, variance, sd, percentContribution }) {
  return {
    ss: roundMetric(ss),
    df,
    ms: roundMetric(ms),
    variance: roundMetric(variance),
    sd: roundMetric(sd),
    percentContribution: roundMetric(percentContribution)
  };
}

export function computeMsaSummary(studyInput, observationsInput) {
  const study = normalizeStudyForSummary(studyInput);
  const observations = Array.isArray(observationsInput) ? observationsInput.slice() : [];
  const partCount = study.partCount;
  const operatorIds = study.operatorUserIds;
  const operatorCount = operatorIds.length;
  const trialsPerPart = study.trialsPerPart;
  const expectedObservationCount = partCount * operatorCount * trialsPerPart;

  if (!partCount || !operatorCount || !trialsPerPart || partCount < 2 || operatorCount < 2 || trialsPerPart < 2) {
    return { error: "study_not_ready_for_analysis" };
  }

  const operatorIndex = new Map(operatorIds.map((operatorId, idx) => [operatorId, idx]));
  const cellValues = new Map();
  const partValues = new Map();
  const operatorValues = new Map();
  let total = 0;
  let sum = 0;

  for (const observation of observations) {
    const partNumber = Number(observation.partNumber);
    const operatorUserId = Number(observation.operatorUserId);
    const trialNumber = Number(observation.trialNumber);
    const measurement = Number(observation.measurement);

    if (
      !Number.isInteger(partNumber) || partNumber < 1 || partNumber > partCount ||
      !operatorIndex.has(operatorUserId) ||
      !Number.isInteger(trialNumber) || trialNumber < 1 || trialNumber > trialsPerPart ||
      !Number.isFinite(measurement)
    ) {
      return { error: "study_not_ready_for_analysis" };
    }

    const cellKey = `${partNumber}:${operatorUserId}`;
    const cellList = cellValues.get(cellKey) || [];
    cellList.push({ trialNumber, measurement });
    cellValues.set(cellKey, cellList);

    const partList = partValues.get(partNumber) || [];
    partList.push(measurement);
    partValues.set(partNumber, partList);

    const operatorList = operatorValues.get(operatorUserId) || [];
    operatorList.push(measurement);
    operatorValues.set(operatorUserId, operatorList);

    total += 1;
    sum += measurement;
  }

  const missingCells = [];
  for (let partNumber = 1; partNumber <= partCount; partNumber += 1) {
    for (const operatorUserId of operatorIds) {
      const cellList = cellValues.get(`${partNumber}:${operatorUserId}`) || [];
      if (cellList.length !== trialsPerPart) {
        missingCells.push({
          partNumber,
          operatorUserId,
          expected: trialsPerPart,
          observed: cellList.length
        });
      }
    }
  }

  if (missingCells.length > 0) {
    return {
      error: "study_not_ready_for_analysis",
      expectedObservationCount,
      observedObservationCount: observations.length,
      missingCells
    };
  }

  if (observations.length !== expectedObservationCount) {
    return {
      error: "study_not_ready_for_analysis",
      expectedObservationCount,
      observedObservationCount: observations.length,
      missingCells: []
    };
  }

  const grandMean = sum / total;
  const partMeans = [];
  const operatorMeans = [];
  const cellMeans = [];

  const allValues = [];
  for (const observation of observations) {
    allValues.push(Number(observation.measurement));
  }

  for (let partNumber = 1; partNumber <= partCount; partNumber += 1) {
    const values = partValues.get(partNumber) || [];
    const partMean = values.reduce((acc, value) => acc + value, 0) / values.length;
    partMeans.push({ partNumber, mean: partMean, count: values.length });
  }

  for (const operatorUserId of operatorIds) {
    const values = operatorValues.get(operatorUserId) || [];
    const operatorMean = values.reduce((acc, value) => acc + value, 0) / values.length;
    operatorMeans.push({ operatorUserId, mean: operatorMean, count: values.length });
  }

  for (let partNumber = 1; partNumber <= partCount; partNumber += 1) {
    const partMean = partMeans.find((item) => item.partNumber === partNumber)?.mean ?? grandMean;
    for (const operatorUserId of operatorIds) {
      const values = (cellValues.get(`${partNumber}:${operatorUserId}`) || []).slice().sort((a, b) => a.trialNumber - b.trialNumber);
      const cellMean = values.reduce((acc, item) => acc + item.measurement, 0) / values.length;
      cellMeans.push({
        partNumber,
        operatorUserId,
        mean: cellMean,
        count: values.length,
        trials: values.map((item) => ({
          trialNumber: item.trialNumber,
          measurement: roundMetric(item.measurement)
        })),
        partMean
      });
    }
  }

  const operatorMeanById = new Map(operatorMeans.map((item) => [item.operatorUserId, item.mean]));
  const partMeanByNumber = new Map(partMeans.map((item) => [item.partNumber, item.mean]));
  const cellMeanByKey = new Map(cellMeans.map((item) => [`${item.partNumber}:${item.operatorUserId}`, item.mean]));

  let ssPart = 0;
  let ssOperator = 0;
  let ssInteraction = 0;
  let ssRepeatability = 0;
  let ssTotal = 0;

  for (const value of allValues) {
    ssTotal += (value - grandMean) ** 2;
  }

  for (const { partNumber, mean } of partMeans) {
    ssPart += operatorCount * trialsPerPart * (mean - grandMean) ** 2;
  }

  for (const { operatorUserId, mean } of operatorMeans) {
    ssOperator += partCount * trialsPerPart * (mean - grandMean) ** 2;
  }

  for (const { partNumber, operatorUserId, mean } of cellMeans) {
    const partMean = partMeanByNumber.get(partNumber) ?? grandMean;
    const operatorMean = operatorMeanById.get(operatorUserId) ?? grandMean;
    ssInteraction += trialsPerPart * (mean - partMean - operatorMean + grandMean) ** 2;
  }

  for (const observation of observations) {
    const cellMean = cellMeanByKey.get(`${observation.partNumber}:${observation.operatorUserId}`) ?? grandMean;
    ssRepeatability += (Number(observation.measurement) - cellMean) ** 2;
  }

  const dfPart = partCount - 1;
  const dfOperator = operatorCount - 1;
  const dfInteraction = dfPart * dfOperator;
  const dfRepeatability = partCount * operatorCount * (trialsPerPart - 1);

  const msPart = ssPart / dfPart;
  const msOperator = ssOperator / dfOperator;
  const msInteraction = ssInteraction / dfInteraction;
  const msRepeatability = ssRepeatability / dfRepeatability;

  // Negative variance components can happen with real data when one mean square
  // slightly undershoots another. We clamp them to zero so the baseline stays
  // deterministic and does not surface a misleading negative contribution.
  const repeatabilityVariance = Math.max(msRepeatability, 0);
  const operatorVariance = Math.max((msOperator - msInteraction) / (partCount * trialsPerPart), 0);
  const interactionVariance = Math.max((msInteraction - msRepeatability) / trialsPerPart, 0);
  const reproducibilityVariance = operatorVariance + interactionVariance;
  const gaugeRrVariance = repeatabilityVariance + reproducibilityVariance;
  const partToPartVariance = Math.max((msPart - msInteraction) / (operatorCount * trialsPerPart), 0);
  const totalVariance = gaugeRrVariance + partToPartVariance;

  const repeatabilitySd = Math.sqrt(repeatabilityVariance);
  const operatorSd = Math.sqrt(operatorVariance);
  const interactionSd = Math.sqrt(interactionVariance);
  const reproducibilitySd = Math.sqrt(reproducibilityVariance);
  const gaugeRrSd = Math.sqrt(gaugeRrVariance);
  const partToPartSd = Math.sqrt(partToPartVariance);
  const totalSd = Math.sqrt(totalVariance);
  const gaugeRrStudyVariation = 6 * gaugeRrSd;
  const totalStudyVariation = 6 * totalSd;
  const percentStudyVariation = totalStudyVariation > 0 ? (gaugeRrStudyVariation / totalStudyVariation) * 100 : 0;
  const ndc = gaugeRrSd > 0 ? Math.floor((1.41 * partToPartSd) / gaugeRrSd) : null;
  const verdict = classifyVerdict(percentStudyVariation);

  const partContribution = totalVariance > 0 ? (partToPartVariance / totalVariance) * 100 : 0;
  const repeatabilityContribution = totalVariance > 0 ? (repeatabilityVariance / totalVariance) * 100 : 0;
  const operatorContribution = totalVariance > 0 ? (operatorVariance / totalVariance) * 100 : 0;
  const interactionContribution = totalVariance > 0 ? (interactionVariance / totalVariance) * 100 : 0;
  const reproducibilityContribution = totalVariance > 0 ? (reproducibilityVariance / totalVariance) * 100 : 0;
  const gaugeRrContribution = totalVariance > 0 ? (gaugeRrVariance / totalVariance) * 100 : 0;

  return {
    design: {
      partCount,
      operatorCount,
      trialsPerPart,
      observationCount: total,
      expectedObservationCount
    },
    means: {
      grandMean: roundMetric(grandMean),
      parts: partMeans
        .map((item) => ({
          partNumber: item.partNumber,
          mean: roundMetric(item.mean),
          count: item.count
        }))
        .sort((a, b) => a.partNumber - b.partNumber),
      operators: operatorMeans
        .map((item) => ({
          operatorUserId: item.operatorUserId,
          mean: roundMetric(item.mean),
          count: item.count
        }))
        .sort((a, b) => a.operatorUserId - b.operatorUserId),
      cells: cellMeans
        .map((item) => ({
          partNumber: item.partNumber,
          operatorUserId: item.operatorUserId,
          mean: roundMetric(item.mean),
          count: item.count,
          trials: item.trials
        }))
        .sort((a, b) => (a.partNumber - b.partNumber) || (a.operatorUserId - b.operatorUserId))
    },
    anova: {
      part: componentSummary({
        ss: ssPart,
        df: dfPart,
        ms: msPart,
        variance: partToPartVariance,
        sd: partToPartSd,
        percentContribution: partContribution
      }),
      operator: componentSummary({
        ss: ssOperator,
        df: dfOperator,
        ms: msOperator,
        variance: operatorVariance,
        sd: operatorSd,
        percentContribution: operatorContribution
      }),
      interaction: componentSummary({
        ss: ssInteraction,
        df: dfInteraction,
        ms: msInteraction,
        variance: interactionVariance,
        sd: interactionSd,
        percentContribution: interactionContribution
      }),
      repeatability: componentSummary({
        ss: ssRepeatability,
        df: dfRepeatability,
        ms: msRepeatability,
        variance: repeatabilityVariance,
        sd: repeatabilitySd,
        percentContribution: repeatabilityContribution
      }),
      total: {
        ss: roundMetric(ssTotal),
        df: dfPart + dfOperator + dfInteraction + dfRepeatability,
        ms: roundMetric(ssTotal / (dfPart + dfOperator + dfInteraction + dfRepeatability)),
        variance: roundMetric(totalVariance),
        sd: roundMetric(totalSd),
        percentContribution: 100
      }
    },
    capability: {
      gaugeRrVariance: roundMetric(gaugeRrVariance),
      gaugeRrSd: roundMetric(gaugeRrSd),
      gaugeRrStudyVariation: roundMetric(gaugeRrStudyVariation),
      partToPartVariance: roundMetric(partToPartVariance),
      partToPartSd: roundMetric(partToPartSd),
      totalVariance: roundMetric(totalVariance),
      totalSd: roundMetric(totalSd),
      totalStudyVariation: roundMetric(totalStudyVariation),
      percentStudyVariation: roundMetric(percentStudyVariation),
      ndc
    },
    varianceComponents: {
      repeatability: roundMetric(repeatabilityVariance),
      operator: roundMetric(operatorVariance),
      interaction: roundMetric(interactionVariance),
      reproducibility: roundMetric(reproducibilityVariance),
      gaugeRr: roundMetric(gaugeRrVariance),
      partToPart: roundMetric(partToPartVariance),
      total: roundMetric(totalVariance)
    },
    verdict
  };
}

export async function createMsaStudy(payload, db = { query: rootQuery }) {
  await ensureSchema();

  const studyInput = buildStudyAliases(payload);
  if (!studyInput.title || !studyInput.characteristicName || !studyInput.unit) {
    return { error: "required_fields_missing" };
  }
  if (!studyInput.partCount || !studyInput.operatorUserIds.length || !studyInput.trialsPerPart) {
    return { error: "required_fields_missing" };
  }
  if (studyInput.partCount < 2) {
    return { error: "part_count_too_small" };
  }
  if (studyInput.operatorUserIds.length < 2) {
    return { error: "operator_count_too_small" };
  }
  if (studyInput.trialsPerPart < 2) {
    return { error: "trials_per_part_too_small" };
  }
  if (studyInput.lowerSpec != null && studyInput.upperSpec != null && studyInput.lowerSpec > studyInput.upperSpec) {
    return { error: "invalid_spec_limits" };
  }
  if (studyInput.operatorUserIds.length !== new Set(studyInput.operatorUserIds).size) {
    return { error: "duplicate_operator_user_ids" };
  }

  if (studyInput.partId) {
    const { rows: partRows } = await dbQuery(
      db,
      "SELECT id FROM parts WHERE id = $1",
      [studyInput.partId]
    );
    if (!partRows[0]) return { error: "part_not_found" };
  }

  const { rows: userRows } = await dbQuery(
    db,
    `SELECT id, role
     FROM users
     WHERE id = ANY($1::int[])`,
    [studyInput.operatorUserIds]
  );
  if (userRows.length !== studyInput.operatorUserIds.length) {
    return { error: "unknown_operator_user" };
  }

  const userById = new Map(userRows.map((row) => [Number(row.id), row.role]));
  for (const operatorUserId of studyInput.operatorUserIds) {
    const role = userById.get(operatorUserId);
    if (role !== "Operator") {
      return { error: "operator_role_required" };
    }
  }

  const { rows } = await dbQuery(
    db,
    `INSERT INTO msa_studies
       (title, part_id, characteristic_name, unit, lower_spec, upper_spec, target_value,
        part_count, operator_count, trials_per_part, operator_user_ids_json, notes,
        created_by_user_id, created_by_role)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14)
     RETURNING id, title, part_id, characteristic_name, unit, lower_spec, upper_spec, target_value,
               part_count, operator_count, trials_per_part, operator_user_ids_json, notes,
               summary_json, verdict, created_by_user_id, created_by_role, computed_at, created_at, updated_at`,
    [
      studyInput.title,
      studyInput.partId,
      studyInput.characteristicName,
      studyInput.unit,
      studyInput.lowerSpec,
      studyInput.upperSpec,
      studyInput.targetValue,
      studyInput.partCount,
      studyInput.operatorUserIds.length,
      studyInput.trialsPerPart,
      JSON.stringify(studyInput.operatorUserIds),
      studyInput.notes,
      payload.createdByUserId ?? null,
      payload.createdByRole ?? null
    ]
  );

  return {
    study: shapeStudyRow({ ...rows[0], observation_count: 0 })
  };
}

export async function listMsaStudies(filters = {}, db = { query: rootQuery }) {
  await ensureSchema();

  const clauses = [];
  const params = [];

  if (filters.partId) {
    params.push(String(filters.partId).trim());
    clauses.push(`s.part_id = $${params.length}`);
  }
  if (filters.verdict) {
    params.push(String(filters.verdict).trim());
    clauses.push(`s.verdict = $${params.length}`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const { rows } = await dbQuery(
    db,
    `SELECT s.*,
            COALESCE(o.observation_count, 0)::INT AS observation_count
     FROM msa_studies s
     LEFT JOIN (
       SELECT study_id, COUNT(*)::INT AS observation_count
       FROM msa_measurements
       GROUP BY study_id
     ) o ON o.study_id = s.id
     ${where}
     ORDER BY s.created_at DESC, s.id DESC`,
    params
  );

  return rows.map(shapeStudyRow);
}

export async function getMsaStudy(studyId, db = { query: rootQuery }) {
  await ensureSchema();

  const studyRow = await loadStudyRecord(db, studyId);
  if (!studyRow) return null;
  const observations = await loadStudyObservations(db, studyId);
  return {
    study: shapeStudyRow(studyRow),
    observations
  };
}

export async function recordMsaObservations(studyId, payload, db = { query: rootQuery }) {
  await ensureSchema();

  const studyRow = await loadStudyRecord(db, studyId, { forUpdate: true });
  if (!studyRow) return { error: "study_not_found" };

  const study = normalizeStudyForSummary(studyRow);
  const operatorSet = new Set(study.operatorUserIds);
  const rawObservations = Array.isArray(payload?.observations)
    ? payload.observations
    : Array.isArray(payload)
      ? payload
      : [payload];

  const prepared = [];
  for (const rawObservation of rawObservations) {
    const observation = buildObservationAliases(rawObservation);
    if (
      !observation.partNumber ||
      !observation.operatorUserId ||
      !observation.trialNumber ||
      observation.measurement == null ||
      !Number.isFinite(observation.measurement)
    ) {
      return { error: "required_fields_missing" };
    }
    if (observation.partNumber < 1 || observation.partNumber > study.partCount) {
      return { error: "part_out_of_range" };
    }
    if (!operatorSet.has(observation.operatorUserId)) {
      return { error: "operator_not_in_study" };
    }
    if (observation.trialNumber < 1 || observation.trialNumber > study.trialsPerPart) {
      return { error: "trial_out_of_range" };
    }
    prepared.push(observation);
  }

  const inserted = [];
  for (const observation of prepared) {
    const { rows } = await dbQuery(
      db,
      `INSERT INTO msa_measurements
         (study_id, part_number, operator_user_id, trial_number, measurement, notes, created_by_user_id, created_by_role)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id, study_id, part_number, operator_user_id, trial_number, measurement,
                 notes, created_by_user_id, created_by_role, created_at`,
      [
        studyId,
        observation.partNumber,
        observation.operatorUserId,
        observation.trialNumber,
        observation.measurement,
        observation.notes,
        payload?.createdByUserId ?? null,
        payload?.createdByRole ?? null
      ]
    );
    inserted.push(shapeObservationRow(rows[0]));
  }

  await dbQuery(
    db,
    `UPDATE msa_studies
     SET summary_json = '{}'::jsonb,
         verdict = NULL,
         computed_at = NULL,
         updated_at = NOW()
     WHERE id = $1`,
    [studyId]
  );

  const refreshed = await getMsaStudy(studyId, db);
  return {
    study: refreshed?.study || shapeStudyRow({ ...studyRow, observation_count: inserted.length }),
    observations: inserted
  };
}

export async function getMsaStudySummary(studyId, db = { query: rootQuery }) {
  await ensureSchema();

  const detail = await getMsaStudy(studyId, db);
  if (!detail) return null;

  const summary = computeMsaSummary(detail.study, detail.observations);
  if (summary.error) {
    return summary;
  }

  await dbQuery(
    db,
    `UPDATE msa_studies
     SET summary_json = $2::jsonb,
         verdict = $3,
         computed_at = NOW(),
         updated_at = NOW()
     WHERE id = $1`,
    [studyId, JSON.stringify(summary), summary.verdict]
  );

  const { rows } = await dbQuery(
    db,
    `SELECT s.*,
            COALESCE(o.observation_count, 0)::INT AS observation_count
     FROM msa_studies s
     LEFT JOIN (
       SELECT study_id, COUNT(*)::INT AS observation_count
       FROM msa_measurements
       GROUP BY study_id
     ) o ON o.study_id = s.id
     WHERE s.id = $1`,
    [studyId]
  );

  const updatedStudy = rows[0] ? shapeStudyRow(rows[0]) : detail.study;
  return {
    study: updatedStudy,
    observations: detail.observations,
    summary
  };
}

export { ensureSchema as ensureMsaSchema, shapeStudyRow, shapeObservationRow, buildStudyAliases, buildObservationAliases };
