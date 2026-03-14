import { describe, it, expect } from "vitest";
import {
  MART_TABLES,
  MART_SCHEMA_VERSION,
  validateMartSchemaDefinition,
  buildAdditiveMartMigrationDraft
} from "../src/services/analytics/martSchema.js";
import {
  KPI_CONTRACT_VERSION,
  KPI_DEFINITIONS,
  validateKpiContracts,
  getKpiDefinition,
  computeAllKpis
} from "../src/services/analytics/kpiContracts.js";

describe("Analytics mart and KPI contract scaffolding", () => {
  it("provides a valid mart schema definition", () => {
    const validation = validateMartSchemaDefinition(MART_TABLES);
    expect(MART_SCHEMA_VERSION).toBe("ANA-MART-v3-draft1");
    expect(validation).toMatchObject({ ok: true, errors: [] });
  });

  it("builds additive-only SQL migration drafts", () => {
    const draft = buildAdditiveMartMigrationDraft(MART_TABLES);
    expect(draft).toContain("CREATE TABLE IF NOT EXISTS ana_mart_inspection_fact");
    expect(draft).toContain("CREATE INDEX IF NOT EXISTS");
    expect(draft).not.toContain("DROP TABLE");
    expect(draft).not.toContain("TRUNCATE");
  });

  it("validates KPI contracts and computes values deterministically", () => {
    const validation = validateKpiContracts(KPI_DEFINITIONS);
    expect(KPI_CONTRACT_VERSION).toBe("ANA-KPI-v3-draft1");
    expect(validation.ok).toBe(true);

    const values = computeAllKpis({
      acceptedPieces: 92,
      totalPieces: 100,
      ootPieces: 8,
      correctionEvents: 4,
      replayedRuns: 5,
      totalRuns: 50,
      failedRuns: 3
    });

    expect(values).toMatchObject({
      first_pass_yield: 0.92,
      oot_rate: 0.08,
      correction_burden_index: 0.04,
      connector_replay_rate: 0.1,
      connector_failure_rate: 0.06
    });
  });

  it("returns null for unknown KPI definitions", () => {
    expect(getKpiDefinition("unknown_kpi")).toBeNull();
  });
});

