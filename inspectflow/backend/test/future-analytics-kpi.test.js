import { describe, it, expect } from "vitest";
import { MART_CONTRACT_ID, validateMartQueryShape } from "../src/future/analytics/martContracts.js";
import {
  DEFAULT_KPI_DEFINITIONS,
  KPI_CONTRACT_ID,
  buildKpiQueryContract,
  createKpiRegistry
} from "../src/future/analytics/kpiRegistry.js";

describe("future analytics mart + KPI contracts", () => {
  it("normalizes mart query shape aliases to canonical ANA-MART-v3 fields", () => {
    const result = validateMartQueryShape({
      martId: "inspection_event_mart_v1",
      select: ["partId", { field: "measurementCount", agg: "sum" }],
      groupBy: ["partId"],
      filters: [{ field: "eventAt", op: "between", value: ["2026-03-01", "2026-03-14"] }]
    });

    expect(result.valid).toBe(true);
    expect(result.contractId).toBe(MART_CONTRACT_ID);
    expect(result.query).toMatchObject({
      martId: "inspection_event_mart_v1",
      select: [
        { field: "part_id" },
        { field: "measurement_count", agg: "sum" }
      ],
      groupBy: ["part_id"],
      filters: [{ field: "event_at", op: "between", value: ["2026-03-01", "2026-03-14"] }]
    });
    expect(result.aliasUsage.length).toBeGreaterThan(0);
  });

  it("rejects invalid mart query shape fields", () => {
    const result = validateMartQueryShape({
      martId: "inspection_event_mart_v1",
      select: ["unknownField"]
    });

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/invalid select field/);
  });

  it("builds KPI query contracts from defaults and normalizes dimension aliases", () => {
    const registry = createKpiRegistry(DEFAULT_KPI_DEFINITIONS);

    const contract = buildKpiQueryContract(registry, {
      kpiId: "first_pass_yield",
      grain: "day",
      startAt: "2026-03-01T00:00:00.000Z",
      endAt: "2026-03-14T00:00:00.000Z",
      dimensions: ["siteId", "partId"]
    });

    expect(contract.contractId).toBe(KPI_CONTRACT_ID);
    expect(contract.kpiId).toBe("first_pass_yield");
    expect(contract.metricKey).toBe("pass_pieces");
    expect(contract.denominatorMetricKey).toBe("total_pieces");
    expect(contract.queryShape).toMatchObject({
      martId: "inspection_event_mart_v1",
      groupBy: ["site_id", "part_id"]
    });
    expect(Array.isArray(contract.aliasUsage)).toBe(true);
  });

  it("produces deterministic query shape for canonical and legacy dimension names", () => {
    const registry = createKpiRegistry(DEFAULT_KPI_DEFINITIONS);

    const canonical = buildKpiQueryContract(registry, {
      kpiId: "connector_failure_rate",
      startAt: "2026-03-01T00:00:00.000Z",
      endAt: "2026-03-14T00:00:00.000Z",
      dimensions: ["site_id", "connector_id"]
    });

    const aliased = buildKpiQueryContract(registry, {
      kpiId: "connector_failure_rate",
      startAt: "2026-03-01T00:00:00.000Z",
      endAt: "2026-03-14T00:00:00.000Z",
      dimensions: ["siteId", "connectorId"]
    });

    expect(aliased.queryShape).toEqual(canonical.queryShape);
    expect(aliased.metricKey).toBe(canonical.metricKey);
    expect(aliased.denominatorMetricKey).toBe(canonical.denominatorMetricKey);
  });

  it("rejects unsupported KPI dimensions", () => {
    const registry = createKpiRegistry(DEFAULT_KPI_DEFINITIONS);

    expect(() =>
      buildKpiQueryContract(registry, {
        kpiId: "first_pass_yield",
        startAt: "2026-03-01T00:00:00.000Z",
        endAt: "2026-03-14T00:00:00.000Z",
        dimensions: ["connectorId"]
      })
    ).toThrow(/does not support dimension/);
  });
});
