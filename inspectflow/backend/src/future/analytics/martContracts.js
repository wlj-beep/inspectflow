const FIELD_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*$/;

export const MART_CONTRACT_ID = "ANA-MART-v3";

export const MART_DEFINITIONS = Object.freeze({
  inspection_event_mart_v1: Object.freeze({
    martId: "inspection_event_mart_v1",
    dimensions: ["siteId", "jobId", "partId", "operationId", "lot", "workcenterId", "operatorId"],
    measures: ["measurementCount", "ootCount", "passCount", "reworkCount"],
    timeField: "eventAt"
  }),
  connector_run_mart_v1: Object.freeze({
    martId: "connector_run_mart_v1",
    dimensions: ["siteId", "connectorId", "status"],
    measures: ["runCount", "failureCount", "processedCount", "avgLatencyMs"],
    timeField: "runEndedAt"
  })
});

function isFieldName(value) {
  return typeof value === "string" && FIELD_NAME_PATTERN.test(value);
}

export function getMartDefinition(martId) {
  return MART_DEFINITIONS[martId] ?? null;
}

export function validateMartQueryShape({ martId, select = [], groupBy = [], filters = [] }) {
  const definition = getMartDefinition(martId);
  const errors = [];

  if (!definition) {
    return {
      valid: false,
      errors: [`unknown martId: ${martId}`]
    };
  }

  const allowedFields = new Set([...definition.dimensions, ...definition.measures, definition.timeField]);

  const normalizedSelect = select.map((item) => {
    if (typeof item === "string") {
      return { field: item };
    }
    return item;
  });

  for (const entry of normalizedSelect) {
    if (!isFieldName(entry?.field) || !allowedFields.has(entry.field)) {
      errors.push(`invalid select field: ${entry?.field}`);
      continue;
    }

    if (entry.agg && !definition.measures.includes(entry.field)) {
      errors.push(`aggregations are only allowed for measure fields: ${entry.field}`);
    }
  }

  for (const field of groupBy) {
    if (!isFieldName(field) || !definition.dimensions.includes(field)) {
      errors.push(`invalid groupBy field: ${field}`);
    }
  }

  for (const filter of filters) {
    if (!isFieldName(filter?.field) || !allowedFields.has(filter.field)) {
      errors.push(`invalid filter field: ${filter?.field}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    contractId: MART_CONTRACT_ID,
    query: {
      martId,
      select: normalizedSelect,
      groupBy,
      filters
    }
  };
}
