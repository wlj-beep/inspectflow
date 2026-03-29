function normalizeDate(value) {
  if (value instanceof Date) return value;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function formatUtcDateTime(date, withSeconds) {
  const year = date.getUTCFullYear();
  const month = pad2(date.getUTCMonth() + 1);
  const day = pad2(date.getUTCDate());
  const hour = pad2(date.getUTCHours());
  const minute = pad2(date.getUTCMinutes());
  const second = pad2(date.getUTCSeconds());

  return `${year}-${month}-${day} ${hour}:${minute}${withSeconds ? `:${second}` : ""} UTC`;
}

export function formatTimestampWithZone(value, { empty = "—", withSeconds = false } = {}) {
  if (!value) return empty;
  const date = normalizeDate(value);
  if (!date) return String(value);
  return formatUtcDateTime(date, withSeconds);
}

