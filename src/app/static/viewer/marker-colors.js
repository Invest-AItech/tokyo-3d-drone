export const COLOR_START = '#e879f9';        // Magenta
export const COLOR_INTERMEDIATE = '#fbbf24';  // Amber
export const COLOR_END = '#22d3ee';           // Cyan

export function getMarkerColor(index, total) {
  if (index === 0) return COLOR_START;
  if (index === total - 1) return COLOR_END;
  return COLOR_INTERMEDIATE;
}
