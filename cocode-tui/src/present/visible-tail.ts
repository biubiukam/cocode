/**
 * Estimate rendered rows and keep the newest nodes within a row budget.
 */

import type { ConversationNode } from '../runtime/nodes/types.ts'
import { nodeKey } from '../runtime/nodes/types.ts'
import stringWidth from 'string-width'
import { formatReasoning, formatToolResult } from './text-format.ts'
import {
  extractPartialJsonStringArgument,
  truncatePlanProgress,
} from '../runtime/nodes/tool-view.ts'

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
  maxColumns?: number,
): number {
  const detailed = verbose || expanded
  switch (node.kind) {
    case 'user':
      return 2 + lineCount(node.text, contentColumns(maxColumns, 2))
    case 'assistant': {
      const reasoning = formatReasoning(node.reasoning, detailed, node.streaming)
      const columns = contentColumns(maxColumns, 3)
      return 2 + lineCount(reasoning, columns) + lineCount(node.text, columns)
    }
    case 'tool': {
      const result = formatToolResult(node.result, detailed)
      const plan =
        (node.name === '' ? 'tool' : node.name) === 'exit_plan_mode'
          ? extractPartialJsonStringArgument(node.args, 'plan')
          : undefined
      const planRows =
        plan === undefined
          ? 0
          : lineCount(truncatePlanProgress(plan), contentColumns(maxColumns, 6)) + 1
      if (!detailed) return 2 + planRows
      const columns = contentColumns(maxColumns, 4)
      return (
        2 +
        planRows +
        lineCount(node.args, columns) +
        lineCount(result, columns) +
        (node.error === undefined ? 0 : 1)
      )
    }
    case 'notice':
      if (node.verboseOnly === true && !verbose) return 0
      return 1 + lineCount(node.message, maxColumns)
  }
}

const EMPTY_EXPANDED_NODES: ReadonlySet<string> = new Set()

function lineCount(text: string | undefined, maxColumns?: number): number {
  if (text === undefined || text === '') return 0
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  if (maxColumns === undefined) return lines.length
  const columns = Math.max(1, Math.trunc(maxColumns))
  return lines.reduce(
    (rows, line) => rows + Math.max(1, Math.ceil(stringWidth(line) / columns)),
    0,
  )
}

function contentColumns(maxColumns: number | undefined, chromeColumns: number): number | undefined {
  return maxColumns === undefined ? undefined : Math.max(1, maxColumns - chromeColumns)
}
