/**
 * Cached transcript geometry shared by scrolling, painting, and hit testing.
 *
 * Estimating a node's rows parses markdown and wraps text, so measuring every
 * node on every frame dominates render cost once a session grows. Nodes are
 * republished as new objects whenever their content changes, which makes node
 * identity a safe memo key.
 */

import type { ConversationNode } from '../runtime/nodes/types.ts'
import { nodeKey } from '../runtime/nodes/types.ts'
import { estimateNodeRows, nodeAttached } from './visible-tail.ts'

export type TranscriptWindow = {
  nodes: readonly ConversationNode[]
  /** Index of the first window node inside the measured nodes. */
  startIndex: number
  hiddenRowsBefore: number
}

export type TranscriptMeasure = {
  /** Estimated rows per measured node, aligned with the input order. */
  rows: readonly number[]
  totalRows: number
  maxOffset: number
  window: TranscriptWindow
}

export type TranscriptMeasureOptions = {
  nodes: readonly ConversationNode[]
  maxRows: number
  verbose?: boolean
  expandedNodeIds?: ReadonlySet<string>
  maxColumns?: number
  scrollOffset?: number
}

const EMPTY_WINDOW: TranscriptWindow = {
  nodes: [],
  startIndex: 0,
  hiddenRowsBefore: 0,
}

let rowCache = new WeakMap<ConversationNode, Map<string, number>>()
let cacheHits = 0
let cacheMisses = 0

/** Drop memoised rows. Tests use this to observe cold behaviour. */
export function clearTranscriptLayoutCache(): void {
  rowCache = new WeakMap()
  cacheHits = 0
  cacheMisses = 0
}

export function transcriptLayoutCacheStats(): { hits: number; misses: number } {
  return { hits: cacheHits, misses: cacheMisses }
}

/** Rows a node paints, memoised per node identity and view variant. */
export function cachedNodeRows(
  node: ConversationNode,
  verbose: boolean,
  expanded: boolean,
  maxColumns: number | undefined,
  attached: boolean,
): number {
  const variant = `${maxColumns ?? -1}|${verbose ? 1 : 0}|${expanded ? 1 : 0}|${attached ? 1 : 0}`
  let variants = rowCache.get(node)
  if (variants === undefined) {
    variants = new Map()
    rowCache.set(node, variants)
  }
  const cached = variants.get(variant)
  if (cached !== undefined) {
    cacheHits += 1
    return cached
  }
  cacheMisses += 1
  const rows = estimateNodeRows(node, verbose, expanded, maxColumns, attached)
  variants.set(variant, rows)
  return rows
}

/** Measure transcript rows once and derive the scroll range and paint window. */
export function measureTranscript(options: TranscriptMeasureOptions): TranscriptMeasure {
  const nodes = options.nodes
  const verbose = options.verbose ?? false
  const expandedNodeIds = options.expandedNodeIds
  const budget = normalizeRows(options.maxRows)

  const rows: number[] = []
  let totalRows = 0
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]
    if (node === undefined) {
      rows.push(0)
      continue
    }
    const nodeRows = cachedNodeRows(
      node,
      verbose,
      expandedNodeIds?.has(nodeKey(node.kind, node.id)) === true,
      options.maxColumns,
      nodeAttached(nodes, index),
    )
    rows.push(nodeRows)
    totalRows += nodeRows
  }

  const maxOffset = budget === 0 ? 0 : Math.max(0, totalRows - budget)
  if (budget === 0 || nodes.length === 0) {
    return { rows, totalRows, maxOffset, window: EMPTY_WINDOW }
  }

  const offset = Math.max(0, Math.min(normalizeRows(options.scrollOffset ?? 0), maxOffset))
  const windowEnd = totalRows - offset
  const windowStart = Math.max(0, windowEnd - budget)

  let start = nodes.length
  let end = 0
  let firstNodeStart = 0
  let cursor = 0
  for (let index = 0; index < nodes.length; index += 1) {
    const nodeRows = rows[index] ?? 0
    const nodeStart = cursor
    cursor += nodeRows
    if (nodeStart >= windowEnd) break
    if (nodeRows === 0 || cursor <= windowStart) continue
    if (start === nodes.length) firstNodeStart = nodeStart
    start = Math.min(start, index)
    end = Math.max(end, index + 1)
  }

  if (start >= end) return { rows, totalRows, maxOffset, window: EMPTY_WINDOW }
  return {
    rows,
    totalRows,
    maxOffset,
    window: {
      nodes: nodes.slice(start, end),
      startIndex: start,
      hiddenRowsBefore: Math.max(0, windowStart - firstNodeStart),
    },
  }
}

function normalizeRows(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.trunc(value))
}
