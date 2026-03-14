const ALLOWED_OPERATIONS = new Set(["upsert", "create", "update", "delete"]);
const MAX_TEXT_LENGTH = 200;

export const CANONICAL_ENVELOPE_CONTRACT = Object.freeze({
  id: "INT-INGEST-v1",
  idempotency: "INT-IDEMPOTENCY-v2",
  envelopeVersion: "1.0"
});

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeNonEmptyString(value, fieldName, { maxLength = MAX_TEXT_LENGTH } = {}) {
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string`);
  }

  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${fieldName} is required`);
  }

  if (normalized.length > maxLength) {
    throw new Error(`${fieldName} must be <= ${maxLength} characters`);
  }

  return normalized;
}

function canonicalizeValue(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalizeValue(entry));
  }

  if (isObject(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalizeValue(value[key])])
    );
  }

  return value;
}

export function normalizeCanonicalEnvelope(inputEnvelope) {
  if (!isObject(inputEnvelope)) {
    throw new Error("envelope must be an object");
  }

  const envelopeVersion = normalizeNonEmptyString(inputEnvelope.envelopeVersion, "envelopeVersion");
  if (envelopeVersion !== CANONICAL_ENVELOPE_CONTRACT.envelopeVersion) {
    throw new Error(`envelopeVersion must be ${CANONICAL_ENVELOPE_CONTRACT.envelopeVersion}`);
  }

  const connectorId = normalizeNonEmptyString(inputEnvelope.connectorId, "connectorId");
  const eventType = normalizeNonEmptyString(inputEnvelope.eventType, "eventType");
  const operation = normalizeNonEmptyString(inputEnvelope.operation, "operation").toLowerCase();

  if (!ALLOWED_OPERATIONS.has(operation)) {
    throw new Error(`operation must be one of ${Array.from(ALLOWED_OPERATIONS).join(", ")}`);
  }

  const occurredAt = normalizeNonEmptyString(inputEnvelope.occurredAt, "occurredAt", { maxLength: 50 });
  const date = new Date(occurredAt);
  if (Number.isNaN(date.getTime())) {
    throw new Error("occurredAt must be an ISO datetime string");
  }

  if (!isObject(inputEnvelope.entity)) {
    throw new Error("entity is required");
  }

  const entity = {
    type: normalizeNonEmptyString(inputEnvelope.entity.type, "entity.type"),
    externalId: normalizeNonEmptyString(inputEnvelope.entity.externalId, "entity.externalId", { maxLength: 300 })
  };

  const payload = isObject(inputEnvelope.payload) ? canonicalizeValue(inputEnvelope.payload) : {};
  const metadata = isObject(inputEnvelope.metadata) ? canonicalizeValue(inputEnvelope.metadata) : {};

  return {
    envelopeVersion,
    connectorId,
    eventType,
    operation,
    occurredAt: date.toISOString(),
    entity,
    payload,
    metadata
  };
}

export function validateCanonicalEnvelope(inputEnvelope) {
  try {
    const envelope = normalizeCanonicalEnvelope(inputEnvelope);
    return {
      valid: true,
      errors: [],
      envelope
    };
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : String(error)]
    };
  }
}

export { canonicalizeValue };
