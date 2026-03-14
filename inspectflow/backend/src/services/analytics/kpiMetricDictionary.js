import {
  ANA_KPI_CONTRACT_ID,
  ANA_KPI_METRIC_ALIASES,
  ANA_KPI_METRIC_KEYS,
  normalizeKpiMetrics,
  resolveKpiMetricValue,
  resolveKpiMetricCanonicalKey
} from "./anaV3Vocabulary.js";

export const KPI_METRIC_DICTIONARY_VERSION = ANA_KPI_CONTRACT_ID;

export const KPI_METRIC_KEYS = ANA_KPI_METRIC_KEYS;
export const KPI_METRIC_ALIASES = ANA_KPI_METRIC_ALIASES;

export function resolveMetricKey(metricKey) {
  return resolveKpiMetricCanonicalKey(metricKey);
}

export function resolveMetricValue(metrics, canonicalKey) {
  return resolveKpiMetricValue(metrics, canonicalKey);
}

export function normalizeMetrics(metrics = {}) {
  return normalizeKpiMetrics(metrics);
}
