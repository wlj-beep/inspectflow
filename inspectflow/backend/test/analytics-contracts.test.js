import { describe, it, expect } from "vitest";
import {
  MART_TABLES,
  MART_SCHEMA_VERSION,
  validateMartSchemaDefinition,
  validateMartSchemaParity,
  buildAdditiveMartMigrationDraft
} from "../src/services/analytics/martSchema.js";
import {
  KPI_CONTRACT_VERSION,
  KPI_DEFINITIONS,
  validateKpiContracts,
  getKpiDefinition,
  computeAllKpis
} from "../src/services/analytics/kpiContracts.js";
import { DEFAULT_KPI_DEFINITIONS } from "../src/future/analytics/kpiRegistry.js";
import {
  ANA_KPI_CONTRACT_ID,
  ANA_KPI_METRIC_KEYS,
  ANA_MART_CONTRACT_ID
} from "../src/services/analytics/anaV3Vocabulary.js";

describe("analytics mart and KPI contract scaffolding", () => {
  it("provides a valid mart schema definition and parity with ANA-MART-v3 vocabulary", () => {
    const validation = validateMartSchemaDefinition(MART_TABLES);
    const parity = validateMartSchemaParity();

    expect(MART_SCHEMA_VERSION).toBe(ANA_MART_CONTRACT_ID);
    expect(validation).toMatchObject({ ok: true, errors: [] });
    expect(parity).toMatchObject({ ok: true, errors: [] });
  });

  it("builds additive-only SQL migration drafts", () => {
    const draft = buildAdditiveMartMigrationDraft(MART_TABLES);
    expect(draft).toContain("CREATE TABLE IF NOT EXISTS ana_mart_inspection_fact");
    expect(draft).toContain("CREATE INDEX IF NOT EXISTS");
    expect(draft).not.toContain("DROP TABLE");
    expect(draft).not.toContain("TRUNCATE");
  });

  it("validates KPI contracts and computes deterministic values for canonical and alias metrics", () => {
    const validation = validateKpiContracts(KPI_DEFINITIONS);
    expect(KPI_CONTRACT_VERSION).toBe(ANA_KPI_CONTRACT_ID);
    expect(validation).toMatchObject({ ok: true, errors: [] });

    const canonicalValues = computeAllKpis({
      [ANA_KPI_METRIC_KEYS.PASS_PIECES]: 92,
      [ANA_KPI_METRIC_KEYS.TOTAL_PIECES]: 100,
      [ANA_KPI_METRIC_KEYS.OOT_PIECES]: 8,
      [ANA_KPI_METRIC_KEYS.CORRECTION_EVENTS]: 4,
      [ANA_KPI_METRIC_KEYS.CONNECTOR_REPLAYED_RUNS]: 5,
      [ANA_KPI_METRIC_KEYS.CONNECTOR_TOTAL_RUNS]: 50,
      [ANA_KPI_METRIC_KEYS.CONNECTOR_FAILED_RUNS]: 3
    });

    const aliasValues = computeAllKpis({
      acceptedPieces: 92,
      totalPieces: 100,
      ootCount: 8,
      correctionEvents: 4,
      replayedRuns: 5,
      runCount: 50,
      failedRuns: 3
    });

    expect(canonicalValues).toMatchObject({
      first_pass_yield: 0.92,
      oot_rate: 0.08,
      correction_burden_index: 0.04,
      connector_replay_rate: 0.1,
      connector_failure_rate: 0.06
    });

    expect(aliasValues).toEqual(canonicalValues);
  });

  it("keeps KPI id and metric mapping parity with future ANA-KPI-v3 registry defaults", () => {
    const registryById = new Map(DEFAULT_KPI_DEFINITIONS.map((item) => [item.id, item]));

    expect(new Set(KPI_DEFINITIONS.map((item) => item.id))).toEqual(
      new Set(DEFAULT_KPI_DEFINITIONS.map((item) => item.id))
    );

    for (const definition of KPI_DEFINITIONS) {
      const futureDefinition = registryById.get(definition.id);
      expect(futureDefinition).toBeTruthy();
      expect(definition.martMeasure).toBe(futureDefinition.measure);
      expect(definition.formula.numerator).toBe(futureDefinition.metricKey);
      expect(definition.formula.denominator).toBe(futureDefinition.denominatorMetricKey);
    }
  });

  it("returns null for unknown KPI definitions", () => {
    expect(getKpiDefinition("unknown_kpi")).toBeNull();
  });
});
