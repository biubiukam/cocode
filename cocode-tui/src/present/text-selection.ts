import stringWidth from 'string-width'
import type { ConversationNode } from '../runtime/nodes/types.ts'
import { nodeKey } from '../runtime/nodes/types.ts'
import { readableNodeText } from '../runtime/clipboard.ts'
import { formatReasoning } from './text-format.ts'
import { estimateNodeRows } from './visible-tail.ts'

export type TextPoint = {
  row: number
  column: number
}

export type TextSelection = {
  anchor: TextPoint
  focus: TextPoint
}

export type SelectableLine = {
  nodeKey: string
  text: string
}

export function buildSelectableLines(
  nodes: readonly ConversationNode[],
  verbose: boolean,
  expandedNodeIds: ReadonlySet<string>,
  maxColumns: number,
): readonly SelectableLine[] {
  return nodes.flatMap((node) => {
    const key = nodeKey(node.kind, node.id)
    const rows = estimateNodeRows(node, verbose, expandedNodeIds.has(key), maxColumns)
    const source = selectableText(node, verbose)
    const contentColumns = Math.max(1, maxColumns - contentIndent(node))
    const sourceLines = splitDisplayLines(source, contentColumns)
    const paddingRows = Math.max(0, rows - sourceLines.length)
    return [
      ...Array.from({ length: paddingRows }, () => emptyLine(key)),
      ...sourceLines.map((line) => ({
        nodeKey: key,
        text: line.text,
      })),
    ]
  })
}

export function visibleSelectableLines(
  nodes: readonly ConversationNode[],
  maxRows: number,
  hiddenRowsBefore: number,
  verbose: boolean,
  expandedNodeIds: ReadonlySet<string>,
  maxColumns: number,
): readonly SelectableLine[] {
  const lines = buildSelectableLines(nodes, verbose, expandedNodeIds, maxColumns)
  const start = Math.max(0, Math.trunc(hiddenRowsBefore))
  return lines.slice(start, start + Math.max(0, Math.trunc(maxRows)))
}

export function normalizeTextSelection(selection: TextSelection): TextSelection {
  return comparePoints(selection.anchor, selection.focus) <= 0
    ? selection
    : { anchor: selection.focus, focus: selection.anchor }
}

export function selectedText(
  lines: readonly SelectableLine[],
  selection: TextSelection,
): string {
  const normalized = normalizeTextSelection(selection)
  const startRow = clamp(normalized.anchor.row, 0, Math.max(0, lines.length - 1))
  const endRow = clamp(normalized.focus.row, startRow, Math.max(0, lines.length - 1))
  const result: string[] = []

  for (let row = startRow; row <= endRow; row += 1) {
    const line = lines[row]
    if (line === undefined || line.text === '') continue
    const startColumn = row === startRow ? normalized.anchor.column : 0
    const endColumn = row === endRow ? normalized.focus.column : Number.MAX_SAFE_INTEGER
    const text = sliceByDisplayColumns(line.text, startColumn, endColumn)
    if (text !== '') result.push(text)
  }

  return result.join('\n').trim()
}

export function pointForMouse(row: number, column: number, maxRows: number, maxColumns: number): TextPoint {
  return {
    row: clamp(Math.trunc(row), 0, Math.max(0, Math.trunc(maxRows) - 1)),
    column: clamp(Math.trunc(column), 0, Math.max(0, Math.trunc(maxColumns))),
  }
}

function selectableText(node: ConversationNode, verbose: boolean): string {
  if (node.kind === 'assistant') {
    const reasoning = formatReasoning(node.reasoning, verbose, node.streaming)
    return [reasoning, node.text].filter((value): value is string => value !== undefined && value !== '').join('\n')
  }
  return readableNodeText(node)
}

function contentIndent(node: ConversationNode): number {
  if (node.kind === 'tool') return 4
  if (node.kind === 'assistant') return 3
  return 2
}

function splitDisplayLines(value: string, maxColumns: number): readonly { text: string }[] {
  if (value === '') return []
  const lines: { text: string }[] = []
  for (const rawLine of value.replace(/\r\n?/g, '\n').split('\n')) {
    if (rawLine === '') {
      lines.push({ text: '' })
      continue
    }
    let start = 0
    let width = 0
    let index = 0
    for (const character of rawLine) {
      const characterWidth = Math.max(1, stringWidth(character))
      if (index > start && width + characterWidth > maxColumns) {
        lines.push({ text: rawLine.slice(start, index).trimEnd() })
        start = index
        width = 0
      }
      width += characterWidth
      index += character.length
    }
    lines.push({ text: rawLine.slice(start).trimEnd() })
  }
  return lines
}

function sliceByDisplayColumns(value: string, startColumn: number, endColumn: number): string {
  const start = Math.max(0, Math.trunc(startColumn))
  const end = Math.max(start, Math.trunc(endColumn))
  let width = 0
  let result = ''
  for (const character of value) {
    const nextWidth = width + Math.max(1, stringWidth(character))
    if (nextWidth > start && width < end) result += character
    width = nextWidth
    if (width >= end) break
  }
  return result
}

function comparePoints(left: TextPoint, right: TextPoint): number {
  return left.row - right.row || left.column - right.column
}

function emptyLine(key: string): SelectableLine {
  return { nodeKey: key, text: '' }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}
