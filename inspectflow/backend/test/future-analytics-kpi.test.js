import { describe, it, expect } from "vitest";
import {
  MART_CONTRACT_ID,
  validateMartQueryShape
} from "../src/future/analytics/martContracts.js";
import {
  DEFAULT_KPI_DEFINITIONS,
  KPI_CONTRACT_ID,
  buildKpiQueryContract,
  createKpiRegistry
} from "../src/future/analytics/kpiRegistry.js";

describe("future analytics mart + KPI contracts", () => {
  it("validates mart query shape", () => {
    const result = validateMartQueryShape({
      martId: "inspection_event_mart_v1",
      select: ["partId", { field: "measurementCount", agg: "sum" }],
      groupBy: ["partId"],
      filters: [{ field: "siteId", op: "eq", value: "site-1" }]
    });

    expect(result.valid).toBe(true);
    expect(result.contractId).toBe(MART_CONTRACT_ID);
  });

  it("rejects invalid mart query shape fields", () => {
    const result = validateMartQueryShape({
      martId: "inspection_event_mart_v1",
      select: ["unknownField"]
    });

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/invalid select field/);
  });

  it("builds KPI query contracts from default definitions", () => {
    const registry = createKpiRegistry(DEFAULT_KPI_DEFINITIONS);

    const contract = buildKpiQueryContract(registry, {
      kpiId: "first_pass_yield",
      grain: "day",
      startAt: "2026-03-01T00:00:00.000Z",
      endAt: "2026-03-14T00:00:00.000Z",
      dimensions: ["siteId", "partId"]
    });

    expect(contract.contractId).toBe(KPI_CONTRACT_ID);
    expect(contract.queryShape.martId).toBe("inspection_event_mart_v1");
    expect(contract.queryShape.groupBy).toEqual(["siteId", "partId"]);
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
