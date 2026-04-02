function normalizeValue(value) {
  return String(value ?? "").trim();
}

function isRequiredEmpty(value) {
  return normalizeValue(value).length === 0;
}

function isPositiveInteger(value) {
  const text = normalizeValue(value);
  if (!/^\d+$/.test(text)) return false;
  return Number(text) > 0;
}

function isValidRevision(value) {
  return /^[A-Z0-9]{1,4}$/.test(normalizeValue(value));
}

function isValidItNumber(value) {
  const text = normalizeValue(value).toUpperCase();
  return /^IT-\d{4}$/.test(text);
}

function validateRequired(field, value) {
  if (isRequiredEmpty(value)) return `${field} is required.`;
  return "";
}

export function validateJobFormField(field, value) {
  const key = normalizeValue(field).toLowerCase();
  const text = normalizeValue(value);

  if (["jobnumber", "partnumber", "partrevision", "operation", "lot", "qty"].includes(key)) {
    const requiredErr = validateRequired(field, value);
    if (requiredErr) return requiredErr;
  }

  if (key === "qty") {
    if (!isPositiveInteger(text)) return "Qty must be a positive whole number.";
    return "";
  }

  if (key === "partrevision" || key === "revision") {
    if (!isValidRevision(text.toUpperCase())) return "Revision must be 1-4 uppercase letters or numbers.";
    return "";
  }

  return "";
}

export function validateToolField(field, value) {
  const key = normalizeValue(field).toLowerCase();
  const text = normalizeValue(value);

  if (["name", "type"].includes(key)) {
    const requiredErr = validateRequired(field, value);
    if (requiredErr) return requiredErr;
  }

  if (key === "itnum") {
    if (text && !isValidItNumber(text)) return "IT # must match IT-####.";
    return "";
  }

  return "";
}

export function validatePartField(field, value) {
  const key = normalizeValue(field).toLowerCase();
  const text = normalizeValue(value);

  if (["partnumber", "description", "revision"].includes(key)) {
    const requiredErr = validateRequired(field, value);
    if (requiredErr) return requiredErr;
  }

  if (key === "revision") {
    if (!isValidRevision(text.toUpperCase())) return "Revision must be 1-4 uppercase letters or numbers.";
    return "";
  }

  return "";
}
