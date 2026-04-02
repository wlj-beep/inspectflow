import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { connectMock, pollScheduledIntegrationsMock } = vi.hoisted(() => ({
  connectMock: vi.fn(),
  pollScheduledIntegrationsMock: vi.fn()
}));

vi.mock("../src/db.js", () => ({
  pool: {
    connect: connectMock
  }
}));

vi.mock("../src/routes/importsCore.js", () => ({
  pollScheduledIntegrations: pollScheduledIntegrationsMock
}));

import {
  getImportSchedulerWorkerState,
  runImportSchedulerTick,
  startImportSchedulerWorker,
  stopImportSchedulerWorker
} from "../src/services/integration/schedulerWorker.js";

function buildClient({ locked = true } = {}) {
  return {
    query: vi.fn(async (sql) => {
      if (sql.includes("pg_try_advisory_lock")) {
        return { rows: [{ locked }] };
      }
      if (sql.includes("pg_advisory_unlock")) {
        return { rows: [{ ok: true }] };
      }
      throw new Error(`unexpected sql: ${sql}`);
    }),
    release: vi.fn()
  };
}

describe("import scheduler worker", () => {
  let originalNodeEnv;

  beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV;
    connectMock.mockReset();
    pollScheduledIntegrationsMock.mockReset();
    stopImportSchedulerWorker();
  });

  afterEach(() => {
    stopImportSchedulerWorker();
    vi.useRealTimers();
    process.env.NODE_ENV = originalNodeEnv;
  });

  it("runs a scheduled poll only when it acquires the advisory lock", async () => {
    const client = buildClient({ locked: true });
    connectMock.mockResolvedValue(client);
    pollScheduledIntegrationsMock.mockResolvedValue();

    const ran = await runImportSchedulerTick({ lockKey: 4401 });

    expect(ran).toBe(true);
    expect(pollScheduledIntegrationsMock).toHaveBeenCalledTimes(1);
    expect(client.query).toHaveBeenNthCalledWith(
      1,
      "SELECT pg_try_advisory_lock($1) AS locked",
      [4401]
    );
    expect(client.query).toHaveBeenNthCalledWith(
      2,
      "SELECT pg_advisory_unlock($1)",
      [4401]
    );
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("skips polling when another worker already owns the advisory lock", async () => {
    const client = buildClient({ locked: false });
    connectMock.mockResolvedValue(client);

    const ran = await runImportSchedulerTick({ lockKey: 4402 });

    expect(ran).toBe(false);
    expect(pollScheduledIntegrationsMock).not.toHaveBeenCalled();
    expect(client.query).toHaveBeenCalledTimes(1);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("clears boot and interval timers on stop so the worker does not keep polling", async () => {
    process.env.NODE_ENV = "development";
    vi.useFakeTimers();

    const client = buildClient({ locked: true });
    connectMock.mockResolvedValue(client);
    pollScheduledIntegrationsMock.mockResolvedValue();

    startImportSchedulerWorker({
      intervalMs: 1000,
      bootDelayMs: 250,
      lockKey: 4403
    });

    expect(getImportSchedulerWorkerState().running).toBe(true);

    await vi.advanceTimersByTimeAsync(250);
    expect(pollScheduledIntegrationsMock).toHaveBeenCalledTimes(1);

    stopImportSchedulerWorker();
    expect(getImportSchedulerWorkerState()).toMatchObject({
      running: false,
      startedAt: null
    });

    await vi.advanceTimersByTimeAsync(2000);
    expect(pollScheduledIntegrationsMock).toHaveBeenCalledTimes(1);
  });
});
