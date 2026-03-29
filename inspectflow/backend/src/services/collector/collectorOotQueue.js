/**
 * OOT acknowledgment queue operations.
 * BL-120 (INT-IOT-v1)
 */

/**
 * Insert a new OOT queue entry.
 * @param {import('pg').PoolClient} client
 * @param {{
 *   runId: number|null,
 *   collectorId: number|null,
 *   recordId: number|null,
 *   jobId: string,
 *   dimensionId: number,
 *   pieceNumber: number,
 *   measuredValue: number,
 *   nominal: number|null,
 *   tolPlus: number|null,
 *   tolMinus: number|null,
 *   unit: string|null,
 *   deviceId: string|null,
 *   tagAddress: string|null,
 *   readingTimestamp: string
 * }}
 * @returns {Promise<object>} inserted row
 */
export async function enqueue(client, {
  runId, collectorId, recordId,
  jobId, dimensionId, pieceNumber,
  measuredValue, nominal, tolPlus, tolMinus, unit,
  deviceId, tagAddress, readingTimestamp
}) {
  const { rows } = await client.query(
    `INSERT INTO collector_oot_queue
       (run_id, collector_id, record_id, job_id, dimension_id, piece_number,
        measured_value, nominal, tol_plus, tol_minus, unit,
        device_id, tag_address, reading_timestamp)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING
       id, run_id, collector_id, record_id, job_id, dimension_id, piece_number,
       measured_value, nominal, tol_plus, tol_minus, unit,
       device_id, tag_address, reading_timestamp, status, created_at`,
    [
      runId ?? null, collectorId ?? null, recordId ?? null,
      jobId, dimensionId, pieceNumber,
      measuredValue, nominal ?? null, tolPlus ?? null, tolMinus ?? null, unit ?? null,
      deviceId ?? null, tagAddress ?? null, readingTimestamp
    ]
  );
  return rows[0];
}

/**
 * Acknowledge a pending OOT queue entry and write an audit row.
 * Returns { error } if the entry is not pending.
 * @param {import('pg').PoolClient} client
 * @param {{ ootQueueId: number, userId: number, role: string, note?: string }}
 */
export async function acknowledge(client, { ootQueueId, userId, role, note }) {
  const { rows: existing } = await client.query(
    "SELECT id, status FROM collector_oot_queue WHERE id=$1",
    [ootQueueId]
  );
  if (!existing[0]) return { error: "not_found" };
  if (existing[0].status !== "pending") return { error: "already_actioned" };

  const { rows } = await client.query(
    `UPDATE collector_oot_queue
     SET status='acknowledged',
         acknowledged_by_user_id=$1,
         acknowledged_by_role=$2,
         acknowledged_at=NOW()
     WHERE id=$3
     RETURNING
       id, status, acknowledged_by_user_id, acknowledged_by_role, acknowledged_at`,
    [userId, role, ootQueueId]
  );

  await client.query(
    `INSERT INTO collector_oot_audit
       (oot_queue_id, user_id, user_role, action, before_status, after_status, note)
     VALUES ($1,$2,$3,'acknowledged','pending','acknowledged',$4)`,
    [ootQueueId, userId, role, note ?? null]
  );

  return { ok: true, row: rows[0] };
}

/**
 * Escalate a pending OOT queue entry and write an audit row.
 * @param {import('pg').PoolClient} client
 * @param {{ ootQueueId: number, userId: number, role: string, issueId?: number, note?: string }}
 */
export async function escalate(client, { ootQueueId, userId, role, issueId, note }) {
  const { rows: existing } = await client.query(
    "SELECT id, status FROM collector_oot_queue WHERE id=$1",
    [ootQueueId]
  );
  if (!existing[0]) return { error: "not_found" };
  if (existing[0].status !== "pending") return { error: "already_actioned" };

  const { rows } = await client.query(
    `UPDATE collector_oot_queue
     SET status='escalated',
         escalated_to_issue_id=$1,
         escalation_note=$2
     WHERE id=$3
     RETURNING
       id, status, escalated_to_issue_id, escalation_note`,
    [issueId ?? null, note ?? null, ootQueueId]
  );

  await client.query(
    `INSERT INTO collector_oot_audit
       (oot_queue_id, user_id, user_role, action, before_status, after_status, note)
     VALUES ($1,$2,$3,'escalated','pending','escalated',$4)`,
    [ootQueueId, userId, role, note ?? null]
  );

  return { ok: true, row: rows[0] };
}
