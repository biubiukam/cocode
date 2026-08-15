/** Keep a selected item visible inside a bounded list window. */

export function listWindowStart(selected: number, count: number, size: number): number {
  const safeCount = nonNegativeInteger(count)
  const safeSize = Math.max(1, nonNegativeInteger(size))
  if (safeCount <= safeSize) return 0
  const safeSelected = Math.max(0, Math.min(nonNegativeInteger(selected), safeCount - 1))
  return Math.max(0, Math.min(safeSelected - Math.floor(safeSize / 2), safeCount - safeSize))
}

function nonNegativeInteger(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.trunc(value))
}
