import type { ConversationNode } from '../runtime/nodes/types.ts'
import { nodeKey } from '../runtime/nodes/types.ts'
import { listWindowStart } from './list-window.ts'
import { estimateNodeRows } from './visible-tail.ts'
import { visibleMessageWindow } from './message-scroll.ts'

export function messageKeyAtRow(props: {
  nodes: readonly ConversationNode[]
  maxRows: number
  verbose: boolean
  expandedNodeIds: ReadonlySet<string>
  scrollOffset: number
  row: number
  startRow: number
}): string | undefined {
  if (props.row < props.startRow || props.row >= props.startRow + props.maxRows) return undefined
  const visible = visibleMessageWindow(
    props.nodes,
    props.maxRows,
    props.verbose,
    props.expandedNodeIds,
    props.scrollOffset,
  )
  let cursor = props.startRow
  for (const node of visible) {
    const rows = estimateNodeRows(
      node,
      props.verbose,
      props.expandedNodeIds.has(nodeKey(node.kind, node.id)),
    )
    if (props.row < cursor + rows) return nodeKey(node.kind, node.id)
    cursor += rows
  }
  return undefined
}

export function actionMenuItemIndexAtRow(props: {
  row: number
  menuStartRow: number
  itemCount: number
  selectedIndex: number
  maxRows: number
}): number | undefined {
  if (props.itemCount === 0) return undefined
  const capacity = Math.max(0, Math.min(props.itemCount, Math.trunc(props.maxRows) - 4))
  if (capacity === 0) return undefined
  const start = listWindowStart(props.selectedIndex, props.itemCount, capacity)
  const index = props.row - (props.menuStartRow + 3)
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
