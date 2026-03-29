/**
 * Writes collector_runs rows.
 * BL-120 (INT-IOT-v1)
 */

/**
 * @param {import('pg').PoolClient|import('../db.js')} db - pool or client with .query()
 * @param {{
 *   collectorId: number|null,
 *   sourceProtocol: string,
 *   triggerMode: 'push'|'scheduled'|'manual',
 *   status: 'success'|'partial'|'error',
 *   totalReadings: number,
 *   insertedCount: number,
 *   ootCount: number,
 *   failedCount: number,
 *   summary?: object,
 *   errors?: Array
 * }}
 * @returns {Promise<{ id: number }>}
 */
export async function writeCollectorRun(db, {
  collectorId,
  sourceProtocol,
  triggerMode,
  status,
  totalReadings,
  insertedCount,
  ootCount,
  failedCount,
  summary,
  errors
}) {
  const { rows } = await db.query(
    `INSERT INTO collector_runs
       (collector_id, source_protocol, trigger_mode, status,
        total_readings, inserted_count, oot_count, failed_count,
        summary, errors)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb)
     RETURNING id`,
    [
      collectorId ?? null,
      sourceProtocol,
      triggerMode,
      status,
      totalReadings,
      insertedCount,
      ootCount,
      failedCount,
      summary ? JSON.stringify(summary) : null,
      errors?.length ? JSON.stringify(errors) : null
    ]
  );
  return rows[0];
}
