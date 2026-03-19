import { recordAuthEvent } from "../../auth.js";
import { query } from "../../db.js";

const AUTH_EVENTS_LIMIT_DEFAULT = 50;
const AUTH_EVENTS_LIMIT_MAX = 200;

export function parseEventLimit(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return AUTH_EVENTS_LIMIT_DEFAULT;
  return Math.min(parsed, AUTH_EVENTS_LIMIT_MAX);
}

export async function emitAuthEventSafely(payload) {
  try {
    await recordAuthEvent(payload);
  } catch (err) {
    // Audit failures should never block auth lifecycle flows.
    console.error("auth_event_log_failed", err);
  }
}

export async function listAuthEvents({ eventType, userId, limit }) {
  const where = [];
  const params = [];

  if (eventType) {
    params.push(eventType);
    where.push(`event_type=$${params.length}`);
  }
  if (userId != null) {
    params.push(userId);
    where.push(`user_id=$${params.length}`);
  }

  params.push(limit);
  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const { rows } = await query(
    `SELECT id, event_type, user_id, actor_role, session_id, username, ip_address, user_agent, metadata, created_at
     FROM auth_event_log
     ${whereClause}
     ORDER BY created_at DESC, id DESC
     LIMIT $${params.length}`,
    params
  );
  return rows;
}
