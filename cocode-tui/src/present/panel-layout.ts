/** Shared sizing rules for inline terminal panels. */

export function panelCapacity(
  maxRows: number | undefined,
  chromeRows: number,
  itemCount: number,
): number {
  if (maxRows === undefined) return Math.max(0, Math.trunc(itemCount))
  return Math.max(
    0,
    Math.min(
      Math.max(0, Math.trunc(itemCount)),
      Math.max(0, Math.trunc(maxRows) - Math.max(0, Math.trunc(chromeRows))),
    ),
  )
}

export function compactColumns(columns: number | undefined): 'tiny' | 'compact' | 'wide' {
  if (columns !== undefined && columns < 60) return 'tiny'
  if (columns !== undefined && columns < 120) return 'compact'
  return 'wide'
}
