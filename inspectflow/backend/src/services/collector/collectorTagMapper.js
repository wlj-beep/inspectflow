/**
 * Resolves a device telemetry address to an InspectFlow dimension/job context.
 * BL-120 (INT-IOT-v1)
 */

/**
 * @param {import('pg').PoolClient} client
 * @param {{ collectorId: number, deviceId: string, tagAddress: string }}
 * @returns {Promise<{
 *   dimensionId: number,
 *   jobId: string,
 *   pieceNumber: number,
 *   unitOverride: string|null,
 *   nominal: number,
 *   tol_plus: number,
 *   tol_minus: number,
 *   unit: string,
 *   operationId: number,
 *   partId: string,
 *   lot: string
 * }|null>}
 */
export async function resolveTagMapping(client, { collectorId, deviceId, tagAddress }) {
  const { rows } = await client.query(
    `SELECT
       ctm.dimension_id,
       ctm.job_id,
       ctm.piece_number,
       ctm.unit_override,
       d.nominal,
       d.tol_plus,
       d.tol_minus,
       d.unit,
       d.operation_id,
       j.part_id,
       j.lot
     FROM collector_tag_mappings ctm
     JOIN dimensions d ON d.id = ctm.dimension_id
     JOIN jobs j ON j.id = ctm.job_id
     WHERE ctm.collector_id = $1
       AND ctm.device_id = $2
       AND ctm.tag_address = $3
       AND ctm.enabled = true`,
    [collectorId, deviceId, tagAddress]
  );
  if (!rows[0]) return null;
  const r = rows[0];
  return {
    dimensionId: r.dimension_id,
    jobId: r.job_id,
    pieceNumber: r.piece_number,
    unitOverride: r.unit_override,
    nominal: Number(r.nominal),
    tol_plus: Number(r.tol_plus),
    tol_minus: Number(r.tol_minus),
    unit: r.unit,
    operationId: r.operation_id,
    partId: r.part_id,
    lot: r.lot
  };
}
