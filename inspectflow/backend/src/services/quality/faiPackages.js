import { query as rootQuery } from "../../db.js";
import {
  DEFAULT_AS9102_PROFILE_ID,
  listAs9102Profiles,
  renderAs9102Export
} from "./as9102Exports.js";

function dbQuery(db, text, params) {
  return db.query(text, params);
}

function parsePositiveInteger(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function normalizeOptionalText(value) {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed : null;
}

function resolveProfileId(profileId) {
  const normalized = String(profileId || DEFAULT_AS9102_PROFILE_ID).trim() || DEFAULT_AS9102_PROFILE_ID;
  const knownProfiles = new Set(listAs9102Profiles().map((profile) => profile.id));
  return knownProfiles.has(normalized) ? normalized : null;
}

function packageScopeSql(pkg) {
  if (pkg.context_type === "record") {
    return {
      sql: "r.id = $1",
      params: [Number(pkg.record_id)]
    };
  }
  if (pkg.context_type === "job") {
    return {
      sql: "r.job_id = $1",
      params: [String(pkg.job_id)]
    };
  }

  const params = [pkg.part_id, pkg.lot];
  let sql = "r.part_id = $1 AND r.lot = $2";
  if (pkg.operation_id) {
    params.push(Number(pkg.operation_id));
    sql += ` AND r.operation_id = $${params.length}`;
  }
  return { sql, params };
}

async function resolveCreateContext(db, payload) {
  const recordId = parsePositiveInteger(payload.recordId);
  const jobId = normalizeOptionalText(payload.jobId);
  const partId = normalizeOptionalText(payload.partId);
  const lot = normalizeOptionalText(payload.lot);
  const operationId = payload.operationId == null ? null : parsePositiveInteger(payload.operationId);
  const populated = [recordId ? "record" : null, jobId ? "job" : null, partId || lot || payload.operationId != null ? "part_lot" : null]
    .filter(Boolean);

  if (recordId && (jobId || partId || lot || payload.operationId != null)) {
    return { error: "ambiguous_package_scope" };
  }
  if (jobId && (partId || lot || payload.operationId != null)) {
    return { error: "ambiguous_package_scope" };
  }
  if (populated.length === 0) {
    return { error: "package_scope_required" };
  }
  if ((partId && !lot) || (!partId && lot)) {
    return { error: "part_lot_required" };
  }
  if (payload.operationId != null && !operationId) {
    return { error: "invalid_operation_id" };
  }

  if (recordId) {
    const { rows } = await dbQuery(
      db,
      `SELECT r.id AS record_id, r.job_id, r.part_id, r.lot, r.operation_id, r.timestamp,
              j.part_revision_code, p.description AS part_description
       FROM records r
       LEFT JOIN jobs j ON j.id = r.job_id
       LEFT JOIN parts p ON p.id = r.part_id
       WHERE r.id=$1`,
      [recordId]
    );
    const row = rows[0];
    if (!row) return { error: "record_not_found" };
    return {
      contextType: "record",
      partId: row.part_id,
      lot: row.lot,
      operationId: Number(row.operation_id),
      jobId: row.job_id || null,
      recordId: Number(row.record_id),
      partRevision: row.part_revision_code || "A",
      partDescription: row.part_description || null
    };
  }

  if (jobId) {
    const { rows } = await dbQuery(
      db,
      `SELECT j.id AS job_id, j.part_id, j.lot, j.operation_id, j.part_revision_code,
              p.description AS part_description
       FROM jobs j
       LEFT JOIN parts p ON p.id = j.part_id
       WHERE j.id=$1`,
      [jobId]
    );
    const row = rows[0];
    if (!row) return { error: "job_not_found" };
    return {
      contextType: "job",
      partId: row.part_id,
      lot: row.lot,
      operationId: Number(row.operation_id),
      jobId: row.job_id,
      recordId: null,
      partRevision: row.part_revision_code || "A",
      partDescription: row.part_description || null
    };
  }

  const partRes = await dbQuery(
    db,
    "SELECT id, description FROM parts WHERE id=$1",
    [partId]
  );
  if (!partRes.rows[0]) return { error: "part_not_found" };

  if (operationId) {
    const opRes = await dbQuery(
      db,
      "SELECT id FROM operations WHERE id=$1 AND part_id=$2",
      [operationId, partId]
    );
    if (!opRes.rows[0]) return { error: "operation_not_found" };
  }

  const revisionRes = await dbQuery(
    db,
    `SELECT part_revision_code
     FROM jobs
     WHERE part_id=$1 AND lot=$2
       AND ($3::int IS NULL OR operation_id=$3)
     ORDER BY id DESC
     LIMIT 1`,
    [partId, lot, operationId]
  );

  return {
    contextType: "part_lot",
    partId,
    lot,
    operationId,
    jobId: null,
    recordId: null,
    partRevision: revisionRes.rows[0]?.part_revision_code || "A",
    partDescription: partRes.rows[0].description || null
  };
}

async function listScopedCharacteristics(db, pkg) {
  const scope = packageScopeSql(pkg);
  const packageId = Number(pkg.id);
  const params = [packageId, pkg.part_id, ...scope.params];
  let dimensionFilter = "o.part_id = $2";
  if (pkg.operation_id) {
    params.push(Number(pkg.operation_id));
    dimensionFilter += ` AND d.operation_id = $${params.length}`;
  }
  const scopeOffset = 2;
  const adjustedScopeSql = scope.sql.replace(/\$(\d+)/g, (_match, rawIndex) => `$${Number(rawIndex) + scopeOffset}`);

  const { rows } = await dbQuery(
    db,
    `WITH scoped_records AS (
       SELECT r.id
       FROM records r
       WHERE ${adjustedScopeSql}
     ),
     measurement_rollup AS (
       SELECT rv.dimension_id,
              COUNT(*)::INTEGER AS measurement_count,
              BOOL_OR(rv.is_oot) AS has_oot
       FROM record_values rv
       JOIN scoped_records sr ON sr.id = rv.record_id
       GROUP BY rv.dimension_id
     )
     SELECT d.id AS dimension_id,
            d.operation_id,
            o.op_number,
            o.label AS operation_label,
            d.name,
            d.bubble_number,
            d.feature_type,
            d.gdt_class,
            d.tolerance_zone,
            d.feature_quantity,
            d.feature_units,
            d.feature_modifiers_json,
            d.source_characteristic_key,
            d.nominal,
            d.tol_plus,
            d.tol_minus,
            d.unit,
            COALESCE(mr.measurement_count, 0) AS measurement_count,
            COALESCE(mr.has_oot, FALSE) AS has_oot,
            fps.id AS signoff_id,
            fps.disposition,
            fps.note,
            fps.signed_by_user_id,
            signer.name AS signed_by_user_name,
            fps.signed_by_role,
            fps.signed_at,
            fps.updated_at AS signoff_updated_at
     FROM dimensions d
     JOIN operations o ON o.id = d.operation_id
     LEFT JOIN measurement_rollup mr ON mr.dimension_id = d.id
     LEFT JOIN fai_package_characteristic_signoffs fps
       ON fps.package_id = $1 AND fps.dimension_id = d.id
     LEFT JOIN users signer ON signer.id = fps.signed_by_user_id
     WHERE ${dimensionFilter}
     ORDER BY o.op_number ASC, d.id ASC`,
    params
  );

  return rows.map((row) => ({
    dimensionId: Number(row.dimension_id),
    operationId: Number(row.operation_id),
    operationNumber: row.op_number,
    operationLabel: row.operation_label || null,
    name: row.name,
    bubbleNumber: row.bubble_number || null,
    featureType: row.feature_type || null,
    gdtClass: row.gdt_class || null,
    toleranceZone: row.tolerance_zone || null,
    quantity: row.feature_quantity == null ? null : Number(row.feature_quantity),
    units: row.feature_units || null,
    modifiers: Array.isArray(row.feature_modifiers_json) ? row.feature_modifiers_json : [],
    sourceCharacteristicKey: row.source_characteristic_key || null,
    nominal: row.nominal,
    tolerancePlus: row.tol_plus,
    toleranceMinus: row.tol_minus,
    unit: row.unit,
    measurementCount: Number(row.measurement_count || 0),
    hasOutOfTolerance: !!row.has_oot,
    signoff: row.signoff_id
      ? {
          id: Number(row.signoff_id),
          disposition: row.disposition,
          note: row.note || null,
          signedByUserId: row.signed_by_user_id == null ? null : Number(row.signed_by_user_id),
          signedByUserName: row.signed_by_user_name || null,
          signedByRole: row.signed_by_role || null,
          signedAt: row.signed_at,
          updatedAt: row.signoff_updated_at
        }
      : null
  }));
}

function computeReadiness(pkg, characteristics) {
  const totalCharacteristics = characteristics.length;
  const measuredCharacteristics = characteristics.filter((item) => item.measurementCount > 0).length;
  const signedOffCharacteristics = characteristics.filter((item) => item.signoff?.disposition === "approved").length;
  const rejectedCharacteristics = characteristics.filter((item) => item.signoff?.disposition === "rejected").length;
  const failedCharacteristics = characteristics.filter((item) => item.hasOutOfTolerance).length;
  const missingBalloonCharacteristics = characteristics.filter(
    (item) => !item.bubbleNumber && !item.sourceCharacteristicKey
  ).length;
  const pendingMeasurementCharacteristics = totalCharacteristics - measuredCharacteristics;
  const pendingSignoffCharacteristics = totalCharacteristics - signedOffCharacteristics - rejectedCharacteristics;

  const blockers = [];
  if (totalCharacteristics === 0) blockers.push("no_characteristics_in_scope");
  if (pendingMeasurementCharacteristics > 0) blockers.push("measurements_pending");
  if (pendingSignoffCharacteristics > 0) blockers.push("signoffs_pending");
  if (rejectedCharacteristics > 0) blockers.push("rejected_characteristics_present");
  if (failedCharacteristics > 0) blockers.push("out_of_tolerance_characteristics_present");
  return {
    readyToFinalize: blockers.length === 0,
    blockers,
    totals: {
      characteristics: totalCharacteristics,
      measuredCharacteristics,
      signedOffCharacteristics,
      pendingMeasurementCharacteristics,
      pendingSignoffCharacteristics,
      rejectedCharacteristics,
      failedCharacteristics,
      missingBalloonCharacteristics
    }
  };
}

function buildPackageSummaryInput(pkg, characteristics, readiness) {
  const failed = readiness.totals.failedCharacteristics;
  const measured = readiness.totals.measuredCharacteristics;
  const total = readiness.totals.characteristics;
  const passRate = total > 0 ? (total - failed) / total : 1;
  const inspectorName = pkg.finalized_by_user_name || pkg.created_by_user_name || "Unassigned";

  return {
    part: {
      id: pkg.part_id,
      revision: pkg.part_revision_code || "A",
      description: pkg.part_description || null
    },
    lot: pkg.lot,
    inspector: {
      id: pkg.finalized_by_user_id ?? pkg.created_by_user_id ?? null,
      name: inspectorName,
      role: pkg.finalized_by_role || pkg.created_by_role || null
    },
    stats: {
      measured,
      failed,
      passRate
    },
    characteristics: characteristics.map((item) => ({
      dimensionId: item.dimensionId,
      name: item.name,
      bubbleNumber: item.bubbleNumber,
      featureType: item.featureType,
      gdtClass: item.gdtClass,
      toleranceZone: item.toleranceZone,
      quantity: item.quantity,
      units: item.units,
      modifiers: item.modifiers,
      sourceCharacteristicKey: item.sourceCharacteristicKey,
      measurementCount: item.measurementCount,
      hasOutOfTolerance: item.hasOutOfTolerance,
      signoffDisposition: item.signoff?.disposition || null
    }))
  };
}

async function loadPackageRow(db, packageId, { forUpdate = false } = {}) {
  const params = [packageId];
  const sql = `SELECT fp.*, p.description AS part_description,
                      creator.name AS created_by_user_name,
                      finalizer.name AS finalized_by_user_name,
                      COALESCE(j.part_revision_code, rj.part_revision_code, 'A') AS part_revision_code
               FROM fai_packages fp
               LEFT JOIN parts p ON p.id = fp.part_id
               LEFT JOIN users creator ON creator.id = fp.created_by_user_id
               LEFT JOIN users finalizer ON finalizer.id = fp.finalized_by_user_id
               LEFT JOIN jobs j ON j.id = fp.job_id
               LEFT JOIN records r ON r.id = fp.record_id
               LEFT JOIN jobs rj ON rj.id = r.job_id
               WHERE fp.id=$1${forUpdate ? " FOR UPDATE OF fp" : ""}`;
  const { rows } = await dbQuery(db, sql, params);
  return rows[0] || null;
}

async function listPackageHistory(db, packageId) {
  const { rows } = await dbQuery(
    db,
    `SELECT h.id, h.event_type, h.from_status, h.to_status, h.actor_user_id,
            actor.name AS actor_user_name, h.actor_role, h.detail_json, h.created_at
     FROM fai_package_status_history h
     LEFT JOIN users actor ON actor.id = h.actor_user_id
     WHERE h.package_id=$1
     ORDER BY h.created_at DESC, h.id DESC`,
    [packageId]
  );
  return rows.map((row) => ({
    id: Number(row.id),
    eventType: row.event_type,
    fromStatus: row.from_status || null,
    toStatus: row.to_status || null,
    actorUserId: row.actor_user_id == null ? null : Number(row.actor_user_id),
    actorUserName: row.actor_user_name || null,
    actorRole: row.actor_role || null,
    detail: row.detail_json || {},
    createdAt: row.created_at
  }));
}

function shapePackage(pkg) {
  return {
    id: Number(pkg.id),
    contextType: pkg.context_type,
    partId: pkg.part_id,
    lot: pkg.lot,
    operationId: pkg.operation_id == null ? null : Number(pkg.operation_id),
    jobId: pkg.job_id || null,
    recordId: pkg.record_id == null ? null : Number(pkg.record_id),
    profileId: pkg.profile_id,
    status: pkg.status,
    partRevision: pkg.part_revision_code || "A",
    partDescription: pkg.part_description || null,
    createdByUserId: pkg.created_by_user_id == null ? null : Number(pkg.created_by_user_id),
    createdByUserName: pkg.created_by_user_name || null,
    createdByRole: pkg.created_by_role || null,
    finalizedByUserId: pkg.finalized_by_user_id == null ? null : Number(pkg.finalized_by_user_id),
    finalizedByUserName: pkg.finalized_by_user_name || null,
    finalizedByRole: pkg.finalized_by_role || null,
    finalizedAt: pkg.finalized_at,
    createdAt: pkg.created_at,
    updatedAt: pkg.updated_at
  };
}

export async function listFaiPackages(filters = {}, db = { query: rootQuery }) {
  const clauses = [];
  const params = [];

  if (filters.partId) {
    params.push(String(filters.partId).trim());
    clauses.push(`fp.part_id = $${params.length}`);
  }
  if (filters.lot) {
    params.push(String(filters.lot).trim());
    clauses.push(`fp.lot = $${params.length}`);
  }
  if (filters.status) {
    params.push(String(filters.status).trim());
    clauses.push(`fp.status = $${params.length}`);
  }
  if (filters.jobId) {
    params.push(String(filters.jobId).trim());
    clauses.push(`fp.job_id = $${params.length}`);
  }
  if (filters.recordId != null) {
    params.push(Number(filters.recordId));
    clauses.push(`fp.record_id = $${params.length}`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const { rows } = await dbQuery(
    db,
    `SELECT fp.*, p.description AS part_description,
            creator.name AS created_by_user_name,
            finalizer.name AS finalized_by_user_name,
            COALESCE(j.part_revision_code, rj.part_revision_code, 'A') AS part_revision_code
     FROM fai_packages fp
     LEFT JOIN parts p ON p.id = fp.part_id
     LEFT JOIN users creator ON creator.id = fp.created_by_user_id
     LEFT JOIN users finalizer ON finalizer.id = fp.finalized_by_user_id
     LEFT JOIN jobs j ON j.id = fp.job_id
     LEFT JOIN records r ON r.id = fp.record_id
     LEFT JOIN jobs rj ON rj.id = r.job_id
     ${where}
     ORDER BY fp.created_at DESC, fp.id DESC`,
    params
  );

  return rows.map(shapePackage);
}

export async function getFaiPackage(packageId, db = { query: rootQuery }) {
  const pkg = await loadPackageRow(db, packageId);
  if (!pkg) return null;
  const characteristics = await listScopedCharacteristics(db, pkg);
  const readiness = computeReadiness(pkg, characteristics);
  const history = await listPackageHistory(db, pkg.id);
  return {
    package: shapePackage(pkg),
    readiness,
    characteristics,
    history
  };
}

export async function createFaiPackage(payload, db = { query: rootQuery }) {
  const profileId = resolveProfileId(payload.profileId);
  if (!profileId) return { error: "unknown_profile" };

  const context = await resolveCreateContext(db, payload);
  if (context.error) return context;

  const fauxPackage = {
    id: 0,
    context_type: context.contextType,
    part_id: context.partId,
    lot: context.lot,
    operation_id: context.operationId,
    job_id: context.jobId,
    record_id: context.recordId,
    status: "open"
  };
  const scopedCharacteristics = await listScopedCharacteristics(db, fauxPackage);
  if (!scopedCharacteristics.length) return { error: "no_characteristics_in_scope" };

  const { rows } = await dbQuery(
    db,
    `INSERT INTO fai_packages
       (context_type, part_id, lot, operation_id, job_id, record_id, profile_id, created_by_user_id, created_by_role)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id`,
    [
      context.contextType,
      context.partId,
      context.lot,
      context.operationId,
      context.jobId,
      context.recordId,
      profileId,
      payload.actorUserId || null,
      payload.actorRole || null
    ]
  );
  const packageId = Number(rows[0].id);

  await dbQuery(
    db,
    `INSERT INTO fai_package_status_history
       (package_id, event_type, from_status, to_status, actor_user_id, actor_role, detail_json)
     VALUES ($1,'created',$2,$3,$4,$5,$6::jsonb)`,
    [
      packageId,
      null,
      "open",
      payload.actorUserId || null,
      payload.actorRole || null,
      JSON.stringify({
        contextType: context.contextType,
        partId: context.partId,
        lot: context.lot,
        operationId: context.operationId,
        jobId: context.jobId,
        recordId: context.recordId,
        profileId
      })
    ]
  );

  return getFaiPackage(packageId, db);
}

export async function signoffFaiCharacteristic(payload, db = { query: rootQuery }) {
  const packageId = parsePositiveInteger(payload.packageId);
  const dimensionId = parsePositiveInteger(payload.dimensionId);
  const actorUserId = parsePositiveInteger(payload.actorUserId);
  const note = normalizeOptionalText(payload.note);
  const disposition = String(payload.disposition || "").trim().toLowerCase();

  if (!packageId || !dimensionId || !actorUserId || !payload.actorRole) {
    return { error: "required_fields_missing" };
  }
  if (!["approved", "rejected"].includes(disposition)) {
    return { error: "invalid_disposition" };
  }

  const userRes = await dbQuery(db, "SELECT id FROM users WHERE id=$1", [actorUserId]);
  if (!userRes.rows[0]) return { error: "user_not_found" };

  const pkg = await loadPackageRow(db, packageId, { forUpdate: true });
  if (!pkg) return { error: "not_found" };
  if (pkg.status === "finalized") return { error: "package_finalized" };

  const characteristics = await listScopedCharacteristics(db, pkg);
  const characteristic = characteristics.find((item) => item.dimensionId === dimensionId);
  if (!characteristic) return { error: "dimension_not_in_scope" };

  await dbQuery(
    db,
    `INSERT INTO fai_package_characteristic_signoffs
       (package_id, dimension_id, disposition, note, signed_by_user_id, signed_by_role)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (package_id, dimension_id)
     DO UPDATE SET disposition=EXCLUDED.disposition,
                   note=EXCLUDED.note,
                   signed_by_user_id=EXCLUDED.signed_by_user_id,
                   signed_by_role=EXCLUDED.signed_by_role,
                   signed_at=NOW(),
                   updated_at=NOW()`,
    [packageId, dimensionId, disposition, note, actorUserId, payload.actorRole]
  );

  await dbQuery(
    db,
    `INSERT INTO fai_package_status_history
       (package_id, event_type, from_status, to_status, actor_user_id, actor_role, detail_json)
     VALUES ($1,'signoff_recorded',$2,$3,$4,$5,$6::jsonb)`,
    [
      packageId,
      pkg.status,
      pkg.status,
      actorUserId,
      payload.actorRole,
      JSON.stringify({ dimensionId, disposition, note })
    ]
  );

  return getFaiPackage(packageId, db);
}

export async function finalizeFaiPackage(payload, db = { query: rootQuery }) {
  const packageId = parsePositiveInteger(payload.packageId);
  const actorUserId = parsePositiveInteger(payload.actorUserId);
  if (!packageId || !actorUserId || !payload.actorRole) {
    return { error: "required_fields_missing" };
  }

  const userRes = await dbQuery(db, "SELECT id FROM users WHERE id=$1", [actorUserId]);
  if (!userRes.rows[0]) return { error: "user_not_found" };

  const pkg = await loadPackageRow(db, packageId, { forUpdate: true });
  if (!pkg) return { error: "not_found" };
  if (pkg.status === "finalized") return { error: "package_finalized" };

  const characteristics = await listScopedCharacteristics(db, pkg);
  const readiness = computeReadiness(pkg, characteristics);
  if (!readiness.readyToFinalize) {
    return { error: "package_not_ready", readiness };
  }

  await dbQuery(
    db,
    `UPDATE fai_packages
     SET status='finalized',
         finalized_by_user_id=$2,
         finalized_by_role=$3,
         finalized_at=NOW(),
         updated_at=NOW()
     WHERE id=$1`,
    [packageId, actorUserId, payload.actorRole]
  );

  await dbQuery(
    db,
    `INSERT INTO fai_package_status_history
       (package_id, event_type, from_status, to_status, actor_user_id, actor_role, detail_json)
     VALUES ($1,'finalized',$2,$3,$4,$5,$6::jsonb)`,
    [
      packageId,
      pkg.status,
      "finalized",
      actorUserId,
      payload.actorRole,
      JSON.stringify({ readiness })
    ]
  );

  return getFaiPackage(packageId, db);
}

export async function assembleFaiPackageSummary(packageId, profileId, db = { query: rootQuery }) {
  const pkg = await loadPackageRow(db, packageId);
  if (!pkg) return null;
  const selectedProfileId = resolveProfileId(profileId || pkg.profile_id);
  if (!selectedProfileId) return { error: "unknown_profile" };

  const characteristics = await listScopedCharacteristics(db, pkg);
  const readiness = computeReadiness(pkg, characteristics);
  const input = buildPackageSummaryInput(pkg, characteristics, readiness);
  const exportResult = renderAs9102Export({
    profileId: selectedProfileId,
    input,
    generatedAt: pkg.finalized_at || pkg.updated_at || pkg.created_at
  });

  return {
    package: shapePackage({ ...pkg, profile_id: selectedProfileId }),
    readiness,
    input,
    output: exportResult.output,
    profile: exportResult.profile,
    contractId: exportResult.contractId,
    exportContractId: exportResult.exportContractId,
    availableProfiles: listAs9102Profiles()
  };
}
