function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function toPositiveInteger(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.floor(parsed);
}

function uniqueSortedNumbers(values) {
  return [...new Set(toArray(values).map((value) => Number(value)).filter(Number.isFinite))].sort((a, b) => a - b);
}

function normalizeCellValue(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function getSamplePieces(plan, qty, samplingInterval) {
  if (qty <= 0) return [];

  switch (plan) {
    case "first_last":
      return qty === 1 ? [1] : [1, qty];
    case "first_middle_last": {
      const middle = Math.floor((qty + 1) / 2);
      return [...new Set([1, middle, qty])].sort((a, b) => a - b);
    }
    case "every_5": {
      const pieces = [];
      for (let piece = 1; piece <= qty; piece += 5) pieces.push(piece);
      if (pieces[pieces.length - 1] !== qty) pieces.push(qty);
      return pieces;
    }
    case "every_10": {
      const pieces = [];
      for (let piece = 1; piece <= qty; piece += 10) pieces.push(piece);
      if (pieces[pieces.length - 1] !== qty) pieces.push(qty);
      return pieces;
    }
    case "custom_interval": {
      const interval = Math.max(1, Number(samplingInterval) || 1);
      const pieces = [];
      for (let piece = 1; piece <= qty; piece += interval) pieces.push(piece);
      if (pieces[pieces.length - 1] !== qty) pieces.push(qty);
      return pieces;
    }
    default:
      return Array.from({ length: qty }, (_, index) => index + 1);
  }
}

function isOOT(value, tolPlus, tolMinus, nominal) {
  const normalized = normalizeCellValue(value);
  if (!normalized) return null;

  if (normalized.includes("|")) {
    const [minStr, maxStr] = normalized.split("|");
    const minVal = parseFloat(minStr);
    const maxVal = parseFloat(maxStr);
    const hasMin = !Number.isNaN(minVal);
    const hasMax = !Number.isNaN(maxVal);
    if (!hasMin && !hasMax) return null;
    if (hasMin && minVal < nominal - tolMinus) return true;
    if (hasMax && maxVal > nominal + tolPlus) return true;
    return false;
  }

  if (normalized === "PASS") return false;
  if (normalized === "FAIL") return true;

  const numeric = parseFloat(normalized);
  if (Number.isNaN(numeric)) return null;
  return numeric > nominal + tolPlus || numeric < nominal - tolMinus;
}

function isPlannedCell(dim, piece, currentJob) {
  const qty = toPositiveInteger(currentJob?.qty);
  const plannedPieces = getSamplePieces(dim?.sampling, qty, dim?.samplingInterval);
  return plannedPieces.includes(piece);
}

function isUnlockedCell(cellKey, unlocked) {
  if (!cellKey || !unlocked) return false;

  if (Array.isArray(unlocked)) return unlocked.includes(cellKey);
  if (unlocked instanceof Set) return unlocked.has(cellKey);

  if (typeof unlocked === "object") {
    return Boolean(unlocked[cellKey]);
  }

  return false;
}

function buildMissingSet(missing) {
  if (!missing) return new Set();

  if (missing instanceof Set) {
    return new Set([...missing].map((value) => Number(value)).filter(Number.isFinite));
  }

  if (Array.isArray(missing)) {
    return new Set(missing.map((value) => Number(value)).filter(Number.isFinite));
  }

  return new Set(
    Object.keys(missing)
      .map((value) => Number(value))
      .filter(Number.isFinite)
  );
}

export function computeMeasurementSummary({ dims, allPieces, values, missing, currentJob, unlocked }) {
  const safeDims = toArray(dims);
  const pieces = uniqueSortedNumbers(allPieces);
  const missingSet = buildMissingSet(missing);
  const valueMap = values && typeof values === "object" ? values : {};
  const unlockedMap = unlocked && typeof unlocked === "object" ? unlocked : null;

  let passCount = 0;
  let failCount = 0;
  let naCount = 0;
  let measuredCount = 0;

  for (const piece of pieces) {
    const pieceMissing = missingSet.has(piece);

    for (const dim of safeDims) {
      const cellKey = `${dim.id}_${piece}`;
      const planned = isPlannedCell(dim, piece, currentJob);
      const editable = isUnlockedCell(cellKey, unlockedMap);

      if (!planned && !editable) continue;

      if (pieceMissing) {
        naCount += 1;
        continue;
      }

      const rawValue = normalizeCellValue(valueMap[cellKey]);
      if (!rawValue) {
        naCount += 1;
        continue;
      }

      measuredCount += 1;

      if (rawValue === "PASS") {
        passCount += 1;
        continue;
      }

      if (rawValue === "FAIL") {
        failCount += 1;
        continue;
      }

      const oot = isOOT(rawValue, Number(dim?.tolPlus) || 0, Number(dim?.tolMinus) || 0, Number(dim?.nominal) || 0);
      if (oot === true) {
        failCount += 1;
      } else {
        passCount += 1;
      }
    }
  }

  return {
    passCount,
    failCount,
    naCount,
    measuredCount
  };
}
