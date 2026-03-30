const RECORD_FILTER_KEYS = Object.freeze({
  part: "rec_part",
  op: "rec_op",
  lot: "rec_lot",
  status: "rec_status",
  search: "rec_search"
});

function toSafeString(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function readSearchParams() {
  if (typeof window === "undefined") return new URLSearchParams();
  return new URLSearchParams(window.location.search);
}

export function readRecordsFilterFromUrl(defaults = {}) {
  const params = readSearchParams();
  const filter = {};

  for (const [field, paramName] of Object.entries(RECORD_FILTER_KEYS)) {
    const value = params.get(paramName);
    if (value !== null) {
      filter[field] = toSafeString(value);
      continue;
    }
    filter[field] = toSafeString(defaults[field]);
  }

  return filter;
}

export function writeRecordsFilterToUrl(filter = {}) {
  if (typeof window === "undefined" || typeof window.history === "undefined") return;

  const params = new URLSearchParams(window.location.search);

  for (const [field, paramName] of Object.entries(RECORD_FILTER_KEYS)) {
    const value = toSafeString(filter[field]);
    if (value) {
      params.set(paramName, value);
    } else {
      params.delete(paramName);
    }
  }

  const query = params.toString();
  const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash || ""}`;
  window.history.replaceState({}, "", nextUrl);
}
