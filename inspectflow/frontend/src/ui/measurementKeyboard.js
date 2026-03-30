const CELL_KEY_SEPARATOR = "_";

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

function parseCellKey(key) {
  const raw = String(key || "");
  const splitAt = raw.lastIndexOf(CELL_KEY_SEPARATOR);

  if (splitAt === -1) {
    return { key: raw, dimId: raw, piece: Number.NaN };
  }

  const dimId = raw.slice(0, splitAt);
  const piece = Number(raw.slice(splitAt + 1));
  return { key: raw, dimId, piece };
}

function escapeSelector(value) {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(String(value));
  }

  return String(value).replace(/["\\]/g, "\\$&");
}

function buildSamplePieces(dim, currentJob, fallbackPieces) {
  const qty = toPositiveInteger(currentJob?.qty) || (fallbackPieces.length ? fallbackPieces[fallbackPieces.length - 1] : 0);
  if (qty <= 0) return [];

  const plan = String(dim?.sampling || "100pct");
  const interval = Math.max(1, toPositiveInteger(dim?.samplingInterval) || 1);

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
      const pieces = [];
      for (let piece = 1; piece <= qty; piece += interval) pieces.push(piece);
      if (pieces[pieces.length - 1] !== qty) pieces.push(qty);
      return pieces;
    }
    default:
      return Array.from({ length: qty }, (_, index) => index + 1);
  }
}

function isCellMarkedEditable(cellKey, currentJob) {
  if (!currentJob || !cellKey) return false;

  const unlocked = currentJob.unlocked || currentJob.unlockedCells || currentJob.editableCells;
  if (unlocked && typeof unlocked === "object" && !Array.isArray(unlocked)) {
    if (Boolean(unlocked[cellKey])) return true;
  }

  if (Array.isArray(unlocked) && unlocked.includes(cellKey)) return true;
  if (unlocked instanceof Set && unlocked.has(cellKey)) return true;

  const values = currentJob.values || {};
  return Object.prototype.hasOwnProperty.call(values, cellKey);
}

function isPlannedCell(dim, piece, currentJob, fallbackPieces) {
  const plannedPieces = buildSamplePieces(dim, currentJob, fallbackPieces);
  return plannedPieces.includes(piece);
}

function buildRowMaps(order) {
  const parsed = order.map(parseCellKey);
  const dimOrder = [];
  const pieceOrder = [];

  for (const cell of parsed) {
    if (!dimOrder.includes(cell.dimId)) dimOrder.push(cell.dimId);
    if (Number.isFinite(cell.piece) && !pieceOrder.includes(cell.piece)) {
      pieceOrder.push(cell.piece);
    }
  }

  const rowsByPiece = new Map();
  const colsByDim = new Map();

  for (const cell of parsed) {
    if (!rowsByPiece.has(cell.piece)) rowsByPiece.set(cell.piece, []);
    if (!colsByDim.has(cell.dimId)) colsByDim.set(cell.dimId, []);
    rowsByPiece.get(cell.piece).push(cell.key);
    colsByDim.get(cell.dimId).push(cell.key);
  }

  for (const piece of pieceOrder) {
    const keys = rowsByPiece.get(piece) || [];
    keys.sort((a, b) => dimOrder.indexOf(parseCellKey(a).dimId) - dimOrder.indexOf(parseCellKey(b).dimId));
  }

  for (const dimId of dimOrder) {
    const keys = colsByDim.get(dimId) || [];
    keys.sort((a, b) => pieceOrder.indexOf(parseCellKey(a).piece) - pieceOrder.indexOf(parseCellKey(b).piece));
  }

  return { dimOrder, pieceOrder, rowsByPiece, colsByDim };
}

export function buildGridOrder({ dims, allPieces, missing, currentJob }) {
  const safeDims = toArray(dims);
  const pieces = uniqueSortedNumbers(allPieces);
  const missingSet = new Set(uniqueSortedNumbers(missing));
  const order = [];

  for (const piece of pieces) {
    if (missingSet.has(piece)) continue;

    for (const dim of safeDims) {
      const key = `${dim.id}${CELL_KEY_SEPARATOR}${piece}`;
      if (isPlannedCell(dim, piece, currentJob, pieces) || isCellMarkedEditable(key, currentJob)) {
        order.push(key);
      }
    }
  }

  return order;
}

export function getNeighborKey({ order, currentKey, direction }) {
  const safeOrder = toArray(order).map(String);
  if (safeOrder.length === 0) return null;

  const currentIndex = safeOrder.indexOf(String(currentKey));
  if (currentIndex === -1) return null;

  const currentCell = parseCellKey(currentKey);
  const { rowsByPiece, colsByDim } = buildRowMaps(safeOrder);

  if (direction === "next" || direction === "prev") {
    const step = direction === "next" ? 1 : -1;
    const nextIndex = currentIndex + step;
    return nextIndex >= 0 && nextIndex < safeOrder.length ? safeOrder[nextIndex] : null;
  }

  if (direction === "left" || direction === "right") {
    const row = rowsByPiece.get(currentCell.piece) || [];
    const rowIndex = row.indexOf(String(currentKey));
    if (rowIndex === -1) return null;
    const nextIndex = rowIndex + (direction === "right" ? 1 : -1);
    return nextIndex >= 0 && nextIndex < row.length ? row[nextIndex] : null;
  }

  if (direction === "up" || direction === "down") {
    const column = colsByDim.get(currentCell.dimId) || [];
    const columnIndex = column.indexOf(String(currentKey));
    if (columnIndex === -1) return null;
    const nextIndex = columnIndex + (direction === "down" ? 1 : -1);
    return nextIndex >= 0 && nextIndex < column.length ? column[nextIndex] : null;
  }

  return null;
}

export function moveFocusToKey(key) {
  if (typeof document === "undefined") return false;

  const selector = `[data-cell-key="${escapeSelector(key)}"]`;
  const element = document.querySelector(selector);
  if (!element || typeof element.focus !== "function") return false;

  try {
    element.focus({ preventScroll: true });
  } catch {
    element.focus();
  }

  return true;
}

function findScrollParent(element) {
  if (!element || typeof window === "undefined") return null;

  let node = element.parentElement;
  while (node && node !== document.body) {
    const style = window.getComputedStyle(node);
    const overflowY = style.overflowY;
    const overflowX = style.overflowX;
    if (/(auto|scroll|overlay)/.test(overflowY) || /(auto|scroll|overlay)/.test(overflowX)) {
      return node;
    }
    node = node.parentElement;
  }

  return document.scrollingElement || document.documentElement;
}

export function ensureVisibleCell(key) {
  if (typeof document === "undefined") return false;

  const selector = `[data-cell-key="${escapeSelector(key)}"]`;
  const element = document.querySelector(selector);
  if (!element) return false;

  const container = findScrollParent(element);
  if (!container || container === document.scrollingElement || container === document.documentElement) {
    element.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    return true;
  }

  const elementRect = element.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  const topDelta = elementRect.top - containerRect.top;
  const bottomDelta = elementRect.bottom - containerRect.bottom;
  const leftDelta = elementRect.left - containerRect.left;
  const rightDelta = elementRect.right - containerRect.right;

  if (topDelta < 0) container.scrollTop += topDelta;
  else if (bottomDelta > 0) container.scrollTop += bottomDelta;

  if (leftDelta < 0) container.scrollLeft += leftDelta;
  else if (rightDelta > 0) container.scrollLeft += rightDelta;

  return true;
}
