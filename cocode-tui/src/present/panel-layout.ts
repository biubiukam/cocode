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

export const INSPECTOR_MIN_WIDTH = 24
export const INSPECTOR_MAX_WIDTH = 60
export const INSPECTOR_MIN_MAIN_COLUMNS = 60

export type InspectorLayout = {
  width: number
  mainColumns: number
  startColumn: number
}

/**
 * Usable paint width. The last terminal cell is left empty so a full-width
 * Ink line plus newline cannot trigger TTY auto-wrap.
 */
export function paintColumns(terminalColumns: number): number {
  return Math.max(1, normalizeColumns(terminalColumns) - 1)
}

/** Resolve the horizontal projection shared by the chat layout and resizer. */
export function resolveInspectorLayout(
  terminalColumns: number,
  preferredWidth: number,
): InspectorLayout {
  const columns = paintColumns(terminalColumns)
  const maxWidth = Math.max(
    1,
    Math.min(INSPECTOR_MAX_WIDTH, columns - INSPECTOR_MIN_MAIN_COLUMNS - 1),
  )
  const minWidth = Math.min(INSPECTOR_MIN_WIDTH, maxWidth)
  const width = Math.max(minWidth, Math.min(maxWidth, normalizeColumns(preferredWidth)))
  const mainColumns = Math.max(1, columns - width - 1)
  return { width, mainColumns, startColumn: mainColumns + 2 }
}

function normalizeColumns(value: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.trunc(value)) : 1
}
