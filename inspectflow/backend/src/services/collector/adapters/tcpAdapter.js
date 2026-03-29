/**
 * TCP protocol adapter (BL-120, INT-IOT-v1)
 *
 * Accepts a pipe-delimited key=value string (one reading per line) and
 * normalises into canonical readings array.
 *
 * Simulated input shape (string):
 *   "device_id=CNC-03|tag=OD_DIA|value=12.300|unit=mm|ts=1711537200000"
 *
 * Multi-line frames are supported (one reading per line, \n separated).
 * Required keys: device_id, tag, value
 * Optional keys: unit, ts (unix ms or ISO)
 */

const REQUIRED_KEYS = ["device_id", "tag", "value"];

/**
 * Parses a single pipe-delimited key=value line into a map.
 * @param {string} line
 * @returns {Map<string, string>}
 */
function parseLine(line) {
  const map = new Map();
  const pairs = line.trim().split("|");
  for (const pair of pairs) {
    const eqIdx = pair.indexOf("=");
    if (eqIdx < 1) continue;
    const key = pair.slice(0, eqIdx).trim().toLowerCase();
    const value = pair.slice(eqIdx + 1).trim();
    if (key) map.set(key, value);
  }
  return map;
}

/**
 * @param {unknown} rawInput - string (pipe-delimited key=value, one per line)
 * @returns {{ ok: boolean, readings: Array, errors: string[] }}
 */
export function parseFrame(rawInput) {
  if (typeof rawInput !== "string") {
    return { ok: false, readings: [], errors: ["invalid_frame_type: expected string"] };
  }

  const lines = rawInput.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) {
    return { ok: false, readings: [], errors: ["empty_frame"] };
  }

  const readings = [];
  const errors = [];

  for (let i = 0; i < lines.length; i++) {
    const kv = parseLine(lines[i]);

    const missing = REQUIRED_KEYS.filter((k) => !kv.has(k));
    if (missing.length > 0) {
      errors.push(`line[${i}]: missing_keys: ${missing.join(",")}`);
      continue;
    }

    const numValue = Number(kv.get("value"));
    if (!Number.isFinite(numValue)) {
      errors.push(`line[${i}]: invalid_value`);
      continue;
    }

    const rawTs = kv.get("ts");
    let timestamp;
    if (rawTs) {
      const asNum = Number(rawTs);
      timestamp = Number.isFinite(asNum) ? new Date(asNum) : new Date(rawTs);
    } else {
      timestamp = new Date();
    }
    if (Number.isNaN(timestamp.getTime())) {
      errors.push(`line[${i}]: invalid_timestamp`);
      continue;
    }

    readings.push({
      deviceId: kv.get("device_id"),
      tagName: kv.get("tag"),
      value: numValue,
      unit: kv.get("unit") || null,
      timestamp: timestamp.toISOString(),
      quality: "good"
    });
  }

  if (readings.length === 0 && errors.length > 0) {
    return { ok: false, readings: [], errors };
  }

  return { ok: true, readings, errors };
}
