/**
 * Minimal record + record_value insertion for IoT auto-submissions.
 * Extracted from the full operator submission path in routes/records.js.
 * BL-120 (INT-IOT-v1)
 *
 * Does NOT require an HTTP session — caller supplies operatorUserId directly
 * (use the _iot_system user ID for system submissions).
 */

/**
 * Insert a single-value record (one dimension, one piece) inside an existing
 * DB client transaction.
 *
 * @param {import('pg').PoolClient} client
 * @param {{
 *   jobId: string,
 *   partId: string,
 *   operationId: number,
 *   lot: string,
 *   qty: number,
 *   operatorUserId: number,
 *   dimensionId: number,
 *   pieceNumber: number,
 *   value: number,
 *   isOot: boolean,
 *   comment?: string
 * }}
 * @returns {Promise<{ id: number, oot: boolean }>}
 */
export async function createSingleValueRecord(client, {
  jobId,
  partId,
  operationId,
  lot,
  qty,
  operatorUserId,
  dimensionId,
  pieceNumber,
  value,
  isOot,
  comment
}) {
  const status = "complete";

  // Insert the parent record
  const { rows: recRows } = await client.query(
    `INSERT INTO records
       (job_id, part_id, operation_id, lot, serial_number, qty,
        operator_user_id, status, oot, comment)
     VALUES ($1,$2,$3,$4,NULL,$5,$6,$7,$8,$9)
     RETURNING id, job_id, part_id, operation_id, lot, qty,
               operator_user_id, status, oot, comment`,
    [jobId, partId, operationId, lot, qty, operatorUserId, status, !!isOot, comment ?? null]
  );
  const record = recRows[0];

  // Snapshot dimension spec at time of submission
  const { rows: dimRows } = await client.query(
    `SELECT id, name, bubble_number, feature_type, gdt_class, tolerance_zone,
            feature_quantity, feature_units, feature_modifiers_json,
            source_characteristic_key, nominal, tol_plus, tol_minus,
            unit, sampling, sampling_interval, input_mode
     FROM dimensions
     WHERE id = $1`,
    [dimensionId]
  );
  if (dimRows[0]) {
    const d = dimRows[0];
    await client.query(
      `INSERT INTO record_dimension_snapshots
         (record_id, dimension_id, name, bubble_number, feature_type, gdt_class,
          tolerance_zone, feature_quantity, feature_units, feature_modifiers_json,
          source_characteristic_key, nominal, tol_plus, tol_minus, unit,
          sampling, sampling_interval, input_mode)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$15,$16,$17,$18)`,
      [
        record.id,
        Number(d.id),
        d.name,
        d.bubble_number ?? null,
        d.feature_type ?? null,
        d.gdt_class ?? null,
        d.tolerance_zone ?? null,
        d.feature_quantity == null ? null : Number(d.feature_quantity),
        d.feature_units ?? null,
        JSON.stringify(Array.isArray(d.feature_modifiers_json) ? d.feature_modifiers_json : []),
        d.source_characteristic_key ?? null,
        d.nominal,
        d.tol_plus,
        d.tol_minus,
        d.unit,
        d.sampling,
        d.sampling_interval ?? null,
        d.input_mode ?? "single"
      ]
    );
  }

  // Insert the single measurement value
  await client.query(
    `INSERT INTO record_values (record_id, dimension_id, piece_number, value, is_oot)
     VALUES ($1,$2,$3,$4,$5)`,
    [record.id, dimensionId, pieceNumber, String(value), !!isOot]
  );

  return { id: record.id, oot: !!isOot };
}

/**
 * Look up the _iot_system user ID (cached after first lookup).
 * @param {import('pg').Pool} pool
 * @returns {Promise<number>}
 */
let _cachedSystemUserId = null;
export async function getSystemUserId(pool) {
  if (_cachedSystemUserId) return _cachedSystemUserId;
  const { rows } = await pool.query(
    "SELECT id FROM users WHERE name='_iot_system' LIMIT 1"
  );
  if (!rows[0]) throw new Error("_iot_system user not found. Run seed.sql to create it.");
  _cachedSystemUserId = rows[0].id;
  return _cachedSystemUserId;
}
