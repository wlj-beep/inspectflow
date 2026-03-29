/**
 * OPC-UA protocol adapter (BL-120, INT-IOT-v1)
 *
 * Accepts a simulated OPC-UA payload (JSON) and normalises it into the
 * canonical readings array.  No real network stack — real bridge processes
 * POST this shape to /api/collector/configs/:id/ingest.
 *
 * Simulated input shape:
 *   {
 *     deviceId: "CNC-01",
 *     readings: [
 *       { nodeId: "ns=2;s=BoreDia", value: 12.345, unit: "mm",
 *         timestamp: "2026-03-27T10:00:00Z", quality: "good" }
 *     ]
 *   }
 */

const VALID_QUALITIES = new Set(["good", "uncertain", "bad"]);

/**
 * @param {unknown} rawInput - parsed JSON from request body
 * @returns {{ ok: boolean, readings: Array, errors: string[] }}
 */
export function parseFrame(rawInput) {
  if (!rawInput || typeof rawInput !== "object") {
    return { ok: false, readings: [], errors: ["invalid_frame_type"] };
  }

  const deviceId = String(rawInput.deviceId || "").trim();
  if (!deviceId) {
    return { ok: false, readings: [], errors: ["missing_device_id"] };
  }

  const rawReadings = rawInput.readings;
  if (!Array.isArray(rawReadings) || rawReadings.length === 0) {
    return { ok: false, readings: [], errors: ["missing_readings"] };
  }

  const readings = [];
  const errors = [];

  for (let i = 0; i < rawReadings.length; i++) {
    const r = rawReadings[i];
    const nodeId = String(r?.nodeId || "").trim();
    if (!nodeId) {
      errors.push(`reading[${i}]: missing_node_id`);
      continue;
    }

    const rawValue = r?.value;
    const numValue = Number(rawValue);
    if (rawValue === undefined || rawValue === null || !Number.isFinite(numValue)) {
      errors.push(`reading[${i}]: invalid_value`);
      continue;
    }

    const quality = String(r?.quality || "good").trim().toLowerCase();
    if (!VALID_QUALITIES.has(quality)) {
      errors.push(`reading[${i}]: invalid_quality`);
      continue;
    }

    const timestamp = r?.timestamp ? new Date(r.timestamp) : new Date();
    if (Number.isNaN(timestamp.getTime())) {
      errors.push(`reading[${i}]: invalid_timestamp`);
      continue;
    }

    readings.push({
      deviceId,
      tagName: nodeId,
      value: numValue,
      unit: r?.unit ? String(r.unit).trim() : null,
      timestamp: timestamp.toISOString(),
      quality
    });
  }

  if (readings.length === 0 && errors.length > 0) {
    return { ok: false, readings: [], errors };
  }

  return { ok: true, readings, errors };
}
