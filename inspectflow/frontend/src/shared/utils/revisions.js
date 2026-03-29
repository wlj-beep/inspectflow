const REVISION_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function normalizeRevisionCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
}

export function revisionCodeToIndex(value) {
  const code = normalizeRevisionCode(value);
  if (!code) return null;
  let index = 0;
  for (const ch of code) {
    const n = REVISION_ALPHABET.indexOf(ch);
    if (n < 0) return null;
    index = index * 26 + (n + 1);
  }
  return index;
}

export function revisionIndexToCode(value) {
  let n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return null;
  let out = "";
  while (n > 0) {
    n -= 1;
    out = REVISION_ALPHABET[n % 26] + out;
    n = Math.floor(n / 26);
  }
  return out;
}

export function nextRevisionCode(value) {
  const idx = revisionCodeToIndex(value);
  if (!idx) return "A";
  return revisionIndexToCode(idx + 1);
}
