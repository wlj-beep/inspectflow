export const COLUMN_WIDTH_PRESETS = Object.freeze({
  narrow: 128,
  default: 160,
  wide: 220
});

export function applyColumnWidthPreset(dimIds, preset, current = {}) {
  const target = COLUMN_WIDTH_PRESETS[preset] || COLUMN_WIDTH_PRESETS.default;
  const next = { ...(current || {}) };
  for (const dimId of Array.isArray(dimIds) ? dimIds : []) {
    next[dimId] = target;
  }
  return next;
}
