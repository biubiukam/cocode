import type { ConversationNode } from '../runtime/nodes/types.ts'
import { nodeKey } from '../runtime/nodes/types.ts'
import { estimateNodeRows } from './visible-tail.ts'

const EMPTY_EXPANDED_NODES: ReadonlySet<string> = new Set()

/** Return the largest row offset that can be scrolled above the newest messages. */
export function maxMessageScrollOffset(
  nodes: readonly ConversationNode[],
  maxRows: number,
  verbose = false,
  expandedNodeIds: ReadonlySet<string> = EMPTY_EXPANDED_NODES,
  maxColumns?: number,
): number {
  const budget = normalizeRows(maxRows)
  if (budget === 0) return 0
  const totalRows = nodes.reduce(
    (total, node) =>
      total +
      estimateNodeRows(
        node,
        verbose,
        expandedNodeIds.has(nodeKey(node.kind, node.id)),
        maxColumns,
      ),
    0,
  )
  return Math.max(0, totalRows - budget)
}

/** Return a bottom-based offset that keeps a selected message in the viewport. */
export function scrollOffsetForMessage(
  nodes: readonly ConversationNode[],
  maxRows: number,
  selectedNodeId: string,
  currentOffset = 0,
  verbose = false,
  expandedNodeIds: ReadonlySet<string> = EMPTY_EXPANDED_NODES,
  maxColumns?: number,
): number {
  const budget = normalizeRows(maxRows)
  if (budget === 0 || nodes.length === 0) return 0

  const rows = nodes.map((node) =>
    estimateNodeRows(
      node,
      verbose,
      expandedNodeIds.has(nodeKey(node.kind, node.id)),
      maxColumns,
    ),
  )
  const totalRows = rows.reduce((total, rowCount) => total + rowCount, 0)
  const maxOffset = Math.max(0, totalRows - budget)
  const offset = Math.max(0, Math.min(normalizeRows(currentOffset), maxOffset))
  const selectedIndex = nodes.findIndex((node) => nodeKey(node.kind, node.id) === selectedNodeId)
  if (selectedIndex < 0) return offset

  let selectedStart = 0
  for (let index = 0; index < selectedIndex; index += 1) {
    selectedStart += rows[index] ?? 0
  }
  const selectedEnd = selectedStart + (rows[selectedIndex] ?? 0)
  const windowEnd = totalRows - offset
  const windowStart = Math.max(0, windowEnd - budget)
  if (selectedStart >= windowStart && selectedEnd <= windowEnd) return offset

  const nextWindowStart = Math.max(0, Math.min(selectedStart, maxOffset))
  return maxOffset - nextWindowStart
}

/** Render the row-bounded transcript window at a row offset measured from the bottom. */
export function visibleMessageWindow(
  nodes: readonly ConversationNode[],
  maxRows: number,
  verbose = false,
  expandedNodeIds: ReadonlySet<string> = EMPTY_EXPANDED_NODES,
  scrollOffset = 0,
  maxColumns?: number,
): readonly ConversationNode[] {
  return resolveMessageWindow(
    nodes,
    maxRows,
    verbose,
    expandedNodeIds,
    scrollOffset,
    maxColumns,
  ).nodes
}

export function resolveMessageWindow(
  nodes: readonly ConversationNode[],
  maxRows: number,
  verbose = false,
  expandedNodeIds: ReadonlySet<string> = EMPTY_EXPANDED_NODES,
  scrollOffset = 0,
  maxColumns?: number,
): { nodes: readonly ConversationNode[]; hiddenRowsBefore: number } {
  const budget = normalizeRows(maxRows)
  if (budget === 0 || nodes.length === 0) return { nodes: [], hiddenRowsBefore: 0 }

  const rows = nodes.map((node) =>
    estimateNodeRows(
      node,
      verbose,
      expandedNodeIds.has(nodeKey(node.kind, node.id)),
      maxColumns,
    ),
  )
  const totalRows = rows.reduce((total, rowCount) => total + rowCount, 0)
  const offset = Math.max(
    0,
    Math.min(normalizeRows(scrollOffset), Math.max(0, totalRows - budget)),
  )
  const windowEnd = totalRows - offset
  const windowStart = Math.max(0, windowEnd - budget)

  let start = nodes.length
  let end = 0
  let firstNodeStart = 0
  let cursor = 0
  for (let index = 0; index < nodes.length; index += 1) {
    const nodeRows = rows[index] ?? 0
    const nodeStart = cursor
    const nodeEnd = cursor + nodeRows
    cursor = nodeEnd

    const visible =
      nodeRows > 0
        ? nodeEnd > windowStart && nodeStart < windowEnd
        : nodeStart >= windowStart && nodeStart <= windowEnd
    if (!visible) continue
    if (start === nodes.length) firstNodeStart = nodeStart
    start = Math.min(start, index)
    end = Math.max(end, index + 1)
  }

  return start < end
    ? {
        nodes: nodes.slice(start, end),
        hiddenRowsBefore: Math.max(0, windowStart - firstNodeStart),
      }
    : { nodes: [], hiddenRowsBefore: 0 }
}

function normalizeRows(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.trunc(value))
}
