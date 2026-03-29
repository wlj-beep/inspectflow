import { formatTimestampWithZone } from "./timestamps.js";
import {
  nextRevisionCode,
  normalizeRevisionCode,
  revisionCodeToIndex,
  revisionIndexToCode
} from "./revisions.js";

export function normalizeOpNumber(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!/^\d{1,3}$/.test(raw)) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 999) return null;
  return String(n).padStart(3, "0");
}

export function fmtTs(ts: unknown): string {
  return formatTimestampWithZone(ts, { empty: "" });
}

export {
  nextRevisionCode,
  normalizeRevisionCode,
  revisionCodeToIndex,
  revisionIndexToCode
};
