import { pool } from "../../db.js";
import { pollScheduledIntegrations } from "../../routes/importsCore.js";

const DEFAULT_INTERVAL_MS = 60 * 1000;
const DEFAULT_BOOT_DELAY_MS = 4 * 1000;
const DEFAULT_LEADER_LOCK_KEY = 290011;

let workerHandle = null;
let bootHandle = null;
let workerStartedAt = null;
let workerTickPromise = null;

function toPositiveInt(raw, fallback) {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

async function withLeaderLock(lockKey, fn) {
  const client = await pool.connect();
  let locked = false;
  try {
    const lockRes = await client.query("SELECT pg_try_advisory_lock($1) AS locked", [lockKey]);
    locked = lockRes.rows[0]?.locked === true;
    if (!locked) return false;
    await fn();
    return true;
  } finally {
    if (locked) {
      await client.query("SELECT pg_advisory_unlock($1)", [lockKey]).catch(() => {});
    }
    client.release();
  }
}

export async function runImportSchedulerTick({ lockKey = DEFAULT_LEADER_LOCK_KEY } = {}) {
  return withLeaderLock(lockKey, async () => {
    await pollScheduledIntegrations();
  });
}

export function startImportSchedulerWorker({
  intervalMs = toPositiveInt(process.env.IMPORT_SCHEDULER_INTERVAL_MS, DEFAULT_INTERVAL_MS),
  bootDelayMs = toPositiveInt(process.env.IMPORT_SCHEDULER_BOOT_DELAY_MS, DEFAULT_BOOT_DELAY_MS),
  lockKey = toPositiveInt(process.env.IMPORT_SCHEDULER_LEADER_LOCK_KEY, DEFAULT_LEADER_LOCK_KEY)
} = {}) {
  if (process.env.NODE_ENV === "test") return;
  if (workerHandle) return;

  const tick = () => {
    if (workerTickPromise) return workerTickPromise;
    workerTickPromise = runImportSchedulerTick({ lockKey }).catch((err) => {
      console.error("import_scheduler_tick_failed", err);
    }).finally(() => {
      workerTickPromise = null;
    });
    return workerTickPromise;
  };

  workerHandle = setInterval(tick, intervalMs);
  workerStartedAt = new Date().toISOString();
  bootHandle = setTimeout(tick, bootDelayMs);
}

export function getImportSchedulerWorkerState() {
  return {
    running: Boolean(workerHandle),
    startedAt: workerStartedAt
  };
}

export function stopImportSchedulerWorker() {
  if (bootHandle) {
    clearTimeout(bootHandle);
    bootHandle = null;
  }
  if (workerHandle) {
    clearInterval(workerHandle);
    workerHandle = null;
  }
  workerStartedAt = null;
}
