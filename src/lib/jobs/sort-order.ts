/** Below this gap between neighbors, positions are respaced before a move. */
export const MIN_SORT_ORDER_GAP = 1e-9;

/**
 * The sort_order for a job dropped between two neighbors (lower sort_order
 * shows first). Either neighbor may be missing at the top or bottom of the
 * list. Returns null when the gap is too small and positions need respacing.
 */
export function positionBetween(
  above: number | null,
  below: number | null,
): number | null {
  if (above === null && below === null) return 0;
  if (above === null) return below! - 1;
  if (below === null) return above + 1;
  if (below - above < MIN_SORT_ORDER_GAP) return null;
  return (above + below) / 2;
}

/**
 * The visible neighbors of a job after moving it from one index to another in
 * the visible list. Hidden jobs aren't in the list, so they keep their place.
 */
export function neighborsAfterMove<T>(
  list: readonly T[],
  fromIndex: number,
  toIndex: number,
): { above: T | null; below: T | null } {
  const without = list.filter((_, i) => i !== fromIndex);
  return {
    above: toIndex > 0 ? without[toIndex - 1] : null,
    below: toIndex < without.length ? without[toIndex] : null,
  };
}
