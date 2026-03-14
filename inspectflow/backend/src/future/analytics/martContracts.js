import {
  ANA_MART_CONTRACT_ID,
  ANA_MART_DEFINITIONS,
  canonicalizeMartFieldName,
  getMartDefinition as getCanonicalMartDefinition
} from "../../services/analytics/anaV3Vocabulary.js";

const FIELD_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*$/;

export const MART_CONTRACT_ID = ANA_MART_CONTRACT_ID;
export const MART_DEFINITIONS = ANA_MART_DEFINITIONS;

function isFieldName(value) {
  return typeof value === "string" && FIELD_NAME_PATTERN.test(value);
}

function normalizeField(martId, field, contextLabel, errors, aliasUsage) {
  if (!isFieldName(field)) {
    errors.push(`invalid ${contextLabel} field: ${field}`);
    return null;
  }

  const canonicalField = canonicalizeMartFieldName(martId, field);
  if (!canonicalField) {
    errors.push(`invalid ${contextLabel} field: ${field}`);
    return null;
  }

  if (canonicalField !== field) {
    aliasUsage.push({ from: field, to: canonicalField });
  }

  return canonicalField;
}

export function getMartDefinition(martId) {
  return getCanonicalMartDefinition(martId);
}

export function validateMartQueryShape({ martId, select = [], groupBy = [], filters = [] }) {
  const definition = getMartDefinition(martId);
  const errors = [];
  const aliasUsage = [];

  if (!definition) {
    return {
      valid: false,
      errors: [`unknown martId: ${martId}`]
    };
  }

  const normalizedSelect = [];

  for (const item of select) {
    const entry = typeof item === "string" ? { field: item } : item;
    const canonicalField = normalizeField(
      martId,
      entry?.field,
      "select",
      errors,
      aliasUsage
    );

    if (!canonicalField) {
      continue;
    }

    if (entry?.agg && !definition.measures.includes(canonicalField)) {
      errors.push(`aggregations are only allowed for measure fields: ${entry?.field}`);
      continue;
    }

    normalizedSelect.push({ ...entry, field: canonicalField });
  }

  const normalizedGroupBy = [];
  for (const field of groupBy) {
    const canonicalField = normalizeField(martId, field, "groupBy", errors, aliasUsage);
    if (!canonicalField) {
      continue;
    }
    if (!definition.dimensions.includes(canonicalField)) {
      errors.push(`invalid groupBy field: ${field}`);
      continue;
    }
    normalizedGroupBy.push(canonicalField);
  }

  const normalizedFilters = [];
  for (const filter of filters) {
    const canonicalField = normalizeField(martId, filter?.field, "filter", errors, aliasUsage);
    if (!canonicalField) {
      continue;
    }
    normalizedFilters.push({ ...filter, field: canonicalField });
  }

  return {
    valid: errors.length === 0,
    errors,
    contractId: MART_CONTRACT_ID,
    aliasUsage,
    query: {
      martId,
      select: normalizedSelect,
      groupBy: normalizedGroupBy,
      filters: normalizedFilters
    }
  };
}
