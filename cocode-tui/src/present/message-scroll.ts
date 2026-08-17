import type { ConversationNode } from '../runtime/nodes/types.ts'
import { nodeKey } from '../runtime/nodes/types.ts'
import { SCROLLBAR_COLUMNS } from './layout.ts'
import { measureTranscript } from './transcript-layout.ts'

const EMPTY_EXPANDED_NODES: ReadonlySet<string> = new Set()

/** Return the largest row offset that can be scrolled above the newest messages. */
export function maxMessageScrollOffset(nodes: readonly ConversationNode[], maxRows: number, verbose = false, expandedNodeIds: ReadonlySet<string> = EMPTY_EXPANDED_NODES, maxColumns?: number): number {
  return measureTranscript({ nodes, maxRows, verbose, expandedNodeIds, maxColumns }).maxOffset
}

/** Width left for messages after reserving a scrollbar when content overflows. */
export function transcriptPaintColumns(nodes: readonly ConversationNode[], maxRows: number, verbose = false, expandedNodeIds: ReadonlySet<string> = EMPTY_EXPANDED_NODES, maxColumns?: number): number | undefined {
  if (maxColumns === undefined) return undefined
  const columns = Math.max(1, Math.trunc(maxColumns))
  if (maxMessageScrollOffset(nodes, maxRows, verbose, expandedNodeIds, columns) <= 0) {
    return columns
  }
  return Math.max(1, columns - SCROLLBAR_COLUMNS)
}

/** Return a bottom-based offset that keeps a selected message in the viewport. */
export function scrollOffsetForMessage(nodes: readonly ConversationNode[], maxRows: number, selectedNodeId: string, currentOffset = 0, verbose = false, expandedNodeIds: ReadonlySet<string> = EMPTY_EXPANDED_NODES, maxColumns?: number): number {
  const budget = normalizeRows(maxRows)
  if (budget === 0 || nodes.length === 0) return 0

  const { rows, totalRows, maxOffset } = measureTranscript({ nodes, maxRows, verbose, expandedNodeIds, maxColumns })
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
export function visibleMessageWindow(nodes: readonly ConversationNode[], maxRows: number, verbose = false, expandedNodeIds: ReadonlySet<string> = EMPTY_EXPANDED_NODES, scrollOffset = 0, maxColumns?: number): readonly ConversationNode[] {
  return resolveMessageWindow(nodes, maxRows, verbose, expandedNodeIds, scrollOffset, maxColumns).nodes
}

export function resolveMessageWindow(nodes: readonly ConversationNode[], maxRows: number, verbose = false, expandedNodeIds: ReadonlySet<string> = EMPTY_EXPANDED_NODES, scrollOffset = 0, maxColumns?: number): { nodes: readonly ConversationNode[]; hiddenRowsBefore: number } {
  const { window } = measureTranscript({ nodes, maxRows, verbose, expandedNodeIds, maxColumns, scrollOffset })
  return { nodes: window.nodes, hiddenRowsBefore: window.hiddenRowsBefore }
}

function normalizeRows(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.trunc(value))
}
