/**
 * Estimate rendered rows and keep the newest nodes within a row budget.
 */

import type { ConversationNode } from '../runtime/nodes/types.ts'
import { nodeKey } from '../runtime/nodes/types.ts'
import { formatReasoning, formatToolResult } from './text-format.ts'

export function visibleTail(
  nodes: readonly ConversationNode[],
  maxRows: number,
  verbose = false,
  expandedNodeIds: ReadonlySet<string> = EMPTY_EXPANDED_NODES,
): readonly ConversationNode[] {
  const budget = Math.max(0, Math.trunc(maxRows))
  if (budget === 0 || nodes.length === 0) return []

  let used = 0
  let start = nodes.length
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node = nodes[index]
    if (node === undefined) continue
    const rows = estimateNodeRows(node, verbose, expandedNodeIds.has(nodeKey(node.kind, node.id)))
    if (rows === 0) {
      start = index
      continue
    }
    if (used > 0 && used + rows > budget) break
    used += rows
    start = index
    if (used >= budget) break
  }
  return nodes.slice(start)
}

export function estimateNodeRows(
  node: ConversationNode,
  verbose = false,
  expanded = false,
): number {
  const detailed = verbose || expanded
  switch (node.kind) {
    case 'user':
      return 2 + lineCount(node.text)
    case 'assistant': {
      const reasoning = formatReasoning(node.reasoning, detailed, node.streaming)
      return 2 + lineCount(reasoning) + lineCount(node.text)
    }
    case 'tool': {
      const result = formatToolResult(node.result, detailed)
      if (!detailed) return 2
      return 2 + lineCount(node.args) + lineCount(result) + (node.error === undefined ? 0 : 1)
    }
    case 'notice':
      if (node.verboseOnly === true && !verbose) return 0
      return 1 + lineCount(node.message)
  }
}

const EMPTY_EXPANDED_NODES: ReadonlySet<string> = new Set()

function lineCount(text: string | undefined): number {
  if (text === undefined || text === '') return 0
  return text.replace(/\r\n?/g, '\n').split('\n').length
}
