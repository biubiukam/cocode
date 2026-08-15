import { listWindowStart } from './list-window.ts'

export function composerModelHit(props: {
  row: number
  x: number
  titleRow: number
  modelStartColumn?: number
  modelEndColumn?: number
}): boolean {
  if (
    props.row !== props.titleRow ||
    props.modelStartColumn === undefined ||
    props.modelEndColumn === undefined
  ) return false
  return props.x >= props.modelStartColumn && props.x < props.modelEndColumn
}

export type PopupBounds = {
  startRow: number
  startColumn: number
  rows: number
  columns: number
}

export function popupContains(bounds: PopupBounds, x: number, y: number): boolean {
  return (
    x >= bounds.startColumn &&
    x < bounds.startColumn + bounds.columns &&
    y >= bounds.startRow &&
    y < bounds.startRow + bounds.rows
  )
}

export function actionMenuItemIndexAtRow(props: {
  row: number
  menuStartRow: number
  itemCount: number
  selectedIndex: number
  maxRows: number
  query?: boolean
}): number | undefined {
  if (props.itemCount === 0) return undefined
  const queryRows = props.query === true ? 1 : 0
  const capacity = Math.max(
    0,
    Math.min(props.itemCount, Math.trunc(props.maxRows) - 4 - queryRows),
  )
  if (capacity === 0) return undefined
  const start = listWindowStart(props.selectedIndex, props.itemCount, capacity)
  const index = props.row - (props.menuStartRow + 3 + queryRows)
  const resolved = start + index
  return index >= 0 && index < capacity && resolved < props.itemCount ? resolved : undefined
}

export function listItemIndexAtRow(props: {
  row: number
  itemStartRow: number
  itemCount: number
  selectedIndex: number
  windowSize: number
}): number | undefined {
  if (props.itemCount === 0 || props.windowSize <= 0) return undefined
  const start = listWindowStart(props.selectedIndex, props.itemCount, props.windowSize)
  const offset = props.row - props.itemStartRow
  const visibleCount = Math.min(props.windowSize, props.itemCount - start)
  if (offset < 0 || offset >= visibleCount) return undefined
  return start + offset
}

export function questionOptionIndexAtRow(props: {
  row: number
  firstOptionRow: number
  optionHasDescription: readonly boolean[]
}): number | undefined {
  let cursor = props.firstOptionRow
  for (const [index, hasDescription] of props.optionHasDescription.entries()) {
    const rows = 1 + Number(hasDescription)
    if (props.row >= cursor && props.row < cursor + rows) return index
    cursor += rows
  }
  return undefined
}

export function questionCustomRow(props: {
  firstOptionRow: number
  optionHasDescription: readonly boolean[]
}): number {
  return props.firstOptionRow + props.optionHasDescription.reduce(
    (rows, hasDescription) => rows + 1 + Number(hasDescription),
    0,
  )
}

export function approvalActionAtRow(row: number, panelStartRow: number):
  | 'allowed-once'
  | 'allowed-for-turn'
  | 'rejected'
  | undefined {
  if (row === panelStartRow + 8) return 'allowed-once'
  if (row === panelStartRow + 9) return 'allowed-for-turn'
  if (row === panelStartRow + 10) return 'rejected'
  return undefined
}
