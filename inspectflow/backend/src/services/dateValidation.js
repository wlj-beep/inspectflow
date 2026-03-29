function createInvalidDateError(fieldName) {
  const error = new Error(`invalid_${fieldName}`);
  error.code = `invalid_${fieldName}`;
  error.status = 400;
  return error;
}

function validateCalendarDatePart(rawValue, fieldName) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(rawValue);
  if (!match) {
    throw createInvalidDateError(fieldName);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  if (
    utcDate.getUTCFullYear() !== year
    || utcDate.getUTCMonth() !== month - 1
    || utcDate.getUTCDate() !== day
  ) {
    throw createInvalidDateError(fieldName);
  }
}

export function normalizeCalendarDate(value, fieldName = "date") {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const rawValue = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rawValue)) {
    throw createInvalidDateError(fieldName);
  }
  validateCalendarDatePart(rawValue, fieldName);
  return rawValue;
}

export function normalizeIsoTimestamp(value, fieldName = "timestamp") {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const rawValue = String(value).trim();
  validateCalendarDatePart(rawValue, fieldName);
  const parsed = Date.parse(rawValue);
  if (!Number.isFinite(parsed)) {
    throw createInvalidDateError(fieldName);
  }
  return new Date(parsed).toISOString();
}
