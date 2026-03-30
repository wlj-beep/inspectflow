export const TABLE_DENSITY = Object.freeze({
  compact: "compact",
  expanded: "expanded"
});

const STORAGE_KEY = "inspectflow.tableDensity";

function hasWindow() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function normalizeDensity(mode) {
  return mode === TABLE_DENSITY.compact ? TABLE_DENSITY.compact : TABLE_DENSITY.expanded;
}

export function readTableDensity() {
  if (!hasWindow()) return TABLE_DENSITY.expanded;

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return normalizeDensity(stored);
  } catch {
    return TABLE_DENSITY.expanded;
  }
}

export function writeTableDensity(mode) {
  const next = normalizeDensity(mode);

  if (!hasWindow()) return next;

  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Ignore quota / privacy mode failures and keep the in-memory preference.
  }

  return next;
}

export function cellHighlightClasses({
  activeKey,
  cellKey,
  activeDimId,
  dimId,
  activePiece,
  pieceNum
}) {
  const classes = [];
  const normalizedActiveKey = activeKey == null ? "" : String(activeKey);
  const normalizedCellKey = cellKey == null ? "" : String(cellKey);
  const normalizedActiveDimId = activeDimId == null ? "" : String(activeDimId);
  const normalizedDimId = dimId == null ? "" : String(dimId);
  const normalizedActivePiece = activePiece == null ? "" : String(activePiece);
  const normalizedPieceNum = pieceNum == null ? "" : String(pieceNum);

  if (normalizedActiveKey && normalizedCellKey && normalizedActiveKey === normalizedCellKey) {
    classes.push("is-active-cell");
  }

  if (normalizedActiveDimId && normalizedDimId && normalizedActiveDimId === normalizedDimId) {
    classes.push("is-active-col");
  }

  if (normalizedActivePiece && normalizedPieceNum && normalizedActivePiece === normalizedPieceNum) {
    classes.push("is-active-row");
  }

  return classes.join(" ");
}
