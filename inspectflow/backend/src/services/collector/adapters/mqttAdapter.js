/**
 * MQTT protocol adapter (BL-120, INT-IOT-v1)
 *
 * Accepts a simulated MQTT message payload and normalises into canonical
 * readings array.  deviceId is derived from topic segment index 2 (0-based),
 * tagName is the full topic path.
 *
 * Simulated input shape:
 *   {
 *     topic: "factory/line-1/CNC-02/bore_dia",
 *     payload: "12.445",          // or numeric
 *     timestamp: "2026-03-27T10:00:01Z",  // optional
 *     qos: 1
 *   }
 *
 * Topic convention: factory/<line>/<deviceId>/<measurement>
 * Minimum 3 segments required.
 */

const MIN_TOPIC_SEGMENTS = 3;

/**
 * @param {unknown} rawInput
 * @returns {{ ok: boolean, readings: Array, errors: string[] }}
 */
export function parseFrame(rawInput) {
  if (!rawInput || typeof rawInput !== "object") {
    return { ok: false, readings: [], errors: ["invalid_frame_type"] };
  }

  const topic = String(rawInput.topic || "").trim();
  if (!topic) {
    return { ok: false, readings: [], errors: ["missing_topic"] };
  }

  const segments = topic.split("/");
  if (segments.length < MIN_TOPIC_SEGMENTS) {
    return {
      ok: false,
      readings: [],
      errors: [`topic_too_short: need at least ${MIN_TOPIC_SEGMENTS} segments`]
    };
  }

  const deviceId = segments[2];
  if (!deviceId) {
    return { ok: false, readings: [], errors: ["missing_device_id_in_topic"] };
  }

  const rawPayload = rawInput.payload;
  const numValue = Number(rawPayload);
  if (rawPayload === undefined || rawPayload === null || !Number.isFinite(numValue)) {
    return { ok: false, readings: [], errors: ["invalid_payload_value"] };
  }

  const timestamp = rawInput.timestamp ? new Date(rawInput.timestamp) : new Date();
  if (Number.isNaN(timestamp.getTime())) {
    return { ok: false, readings: [], errors: ["invalid_timestamp"] };
  }

  return {
    ok: true,
    readings: [
      {
        deviceId,
        tagName: topic,
        value: numValue,
        unit: null,
        timestamp: timestamp.toISOString(),
        quality: "good"
      }
    ],
    errors: []
  };
}
