import { marked, type Token, type Tokens } from 'marked'
import { Box, Text } from 'ink'
import type { ReactNode } from 'react'
import { memo, useMemo, useRef } from 'react'
import stringWidth from 'string-width'
import { theme } from '../theme.ts'

export type MarkdownBlock =
  | { kind: 'heading'; depth: number; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'code'; text: string; lang?: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'quote'; text: string }
  | { kind: 'table'; header: string[]; rows: string[][] }
  | { kind: 'rule' }
  | { kind: 'text'; text: string }

const BLOCK_CACHE_LIMIT = 100
const BLOCK_CACHE_CHARS = 160_000
const blockCache = new Map<string, readonly MarkdownBlock[]>()
let blockCacheChars = 0

export const Markdown = memo(function Markdown(props: { text: string; maxColumns?: number }) {
  const blocks = useMemo(() => parseMarkdownBlocks(props.text), [props.text])
  return (
    <Box flexDirection="column">
      {blocks.map((block, index) => (
        <MarkdownBlockView
          block={block}
          key={`${block.kind}:${index}`}
          maxColumns={props.maxColumns}
        />
      ))}
    </Box>
  )
})

export function StreamingMarkdown(props: { text: string; maxColumns?: number }) {
  const stablePrefix = useRef('')
  const split = useMemo(
    () => splitStreamingMarkdown(props.text, stablePrefix.current),
    [props.text],
  )
  stablePrefix.current = split.stablePrefix
  return (
    <Box flexDirection="column">
      {split.stablePrefix !== '' ? (
        <Markdown text={split.stablePrefix} maxColumns={props.maxColumns} />
      ) : null}
      {split.unstableSuffix !== '' ? (
        <Markdown text={split.unstableSuffix} maxColumns={props.maxColumns} />
      ) : null}
    </Box>
  )
}

export function parseMarkdownBlocks(text: string): readonly MarkdownBlock[] {
  const cached = blockCache.get(text)
  if (cached !== undefined) return cached
  let blocks: MarkdownBlock[]
  try {
    blocks = marked.lexer(text).flatMap(toBlocks)
  } catch {
    blocks = [{ kind: 'text', text }]
  }
  if (text.length <= BLOCK_CACHE_CHARS) {
    if (blockCache.size >= BLOCK_CACHE_LIMIT || blockCacheChars + text.length > BLOCK_CACHE_CHARS) {
      blockCache.clear()
      blockCacheChars = 0
    }
    blockCache.set(text, blocks)
    blockCacheChars += text.length
  }
  return blocks
}

export function splitStreamingMarkdown(
  text: string,
  stablePrefix: string,
): { stablePrefix: string; unstableSuffix: string } {
  let prefix = stablePrefix
  if (!text.startsWith(prefix)) prefix = ''
  if (prefix === text) return { stablePrefix: prefix, unstableSuffix: '' }
  try {
    const tokens = marked.lexer(text.slice(prefix.length))
    let lastContent = tokens.length - 1
    while (lastContent >= 0 && tokens[lastContent]?.type === 'space') lastContent -= 1
    let advance = 0
    for (let index = 0; index < lastContent; index += 1) {
      advance += tokens[index]?.raw.length ?? 0
    }
    prefix = text.slice(0, prefix.length + advance)
  } catch {
    // Keep the whole message as the unstable suffix while Markdown is incomplete.
  }
  return { stablePrefix: prefix, unstableSuffix: text.slice(prefix.length) }
}

function toBlocks(token: Token): MarkdownBlock[] {
  switch (token.type) {
    case 'heading':
      return [{ kind: 'heading', depth: token.depth, text: token.text }]
    case 'paragraph':
      return [{ kind: 'paragraph', text: token.text }]
    case 'code':
      return [{ kind: 'code', text: token.text, ...(token.lang ? { lang: token.lang } : {}) }]
    case 'list':
      return [
        {
          kind: 'list',
          ordered: token.ordered,
          items: token.items.map((item: Tokens.ListItem) => item.text),
        },
      ]
    case 'blockquote':
      return [{ kind: 'quote', text: token.text }]
    case 'table':
      return [
        {
          kind: 'table',
          header: token.header.map((cell: Tokens.TableCell) => cell.text),
          rows: token.rows.map((row: Tokens.TableCell[]) =>
            row.map((cell: Tokens.TableCell) => cell.text),
          ),
        },
      ]
    case 'hr':
      return [{ kind: 'rule' }]
    case 'space':
      return []
    default:
      return 'text' in token && typeof token.text === 'string'
        ? [{ kind: 'text', text: token.text }]
        : []
  }
}

function MarkdownBlockView(props: { block: MarkdownBlock; maxColumns?: number }) {
  const { block } = props
  if (block.kind === 'heading') {
    return (
      <Text color={theme.brand} bold>
        {'#'.repeat(Math.min(block.depth, 3))} {renderInline(block.text)}
      </Text>
    )
  }
  if (block.kind === 'code') {
    return (
      <Box borderStyle="single" borderColor={theme.border} paddingX={1}>
        <Text color={theme.tool}>
          {block.lang ? `${block.lang}\n` : ''}
          {block.text}
        </Text>
      </Box>
    )
  }
  if (block.kind === 'list') {
    return (
      <Box flexDirection="column">
        {block.items.map((item, index) => (
          <Text key={`${index}:${item}`} color={theme.assistant}>
            <Text color={theme.brand}>{block.ordered ? `${index + 1}.` : '•'}</Text>{' '}
            {renderInline(item)}
          </Text>
        ))}
      </Box>
    )
  }
  if (block.kind === 'quote') {
    return <Text color={theme.dim}>│ {renderInline(block.text)}</Text>
  }
  if (block.kind === 'table') {
    return (
      <Text color={theme.assistant} wrap="truncate-end">
        {renderTable(block.header, block.rows, props.maxColumns)}
      </Text>
    )
  }
  if (block.kind === 'rule') return <Text color={theme.border}>{'─'.repeat(24)}</Text>
  return <Text color={theme.assistant}>{renderInline(block.text)}</Text>
}

function renderInline(text: string): ReactNode {
  const nodes: ReactNode[] = []
  const pattern = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\[[^\]]+\]\([^)]+\)|\*[^*]+\*|_[^_]+_)/g
  let cursor = 0
  for (const match of text.matchAll(pattern)) {
    const value = match[0]
    const index = match.index ?? 0
    if (index > cursor) nodes.push(text.slice(cursor, index))
    if (value.startsWith('**') || value.startsWith('__')) {
      nodes.push(
        <Text key={`${index}:strong`} bold>
          {value.slice(2, -2)}
        </Text>,
      )
    } else if (value.startsWith('`')) {
      nodes.push(
        <Text key={`${index}:code`} color={theme.info}>
          {value.slice(1, -1)}
        </Text>,
      )
    } else if (value.startsWith('[')) {
      const labelEnd = value.indexOf('](')
      nodes.push(
        <Text key={`${index}:link`} color={theme.info}>
          {value.slice(1, labelEnd)}
        </Text>,
      )
    } else {
      nodes.push(
        <Text key={`${index}:em`} italic>
          {value.slice(1, -1)}
        </Text>,
      )
    }
    cursor = index + value.length
  }
  if (cursor < text.length) nodes.push(text.slice(cursor))
  return nodes
}

export function renderTable(
  header: readonly string[],
  rows: readonly (readonly string[])[],
  maxColumns = 80,
): string {
  const columnCount = Math.max(header.length, ...rows.map((row) => row.length), 1)
  const allRows = [header, ...rows]
  const widths = tableColumnWidths(allRows, columnCount, maxColumns)
  const line = (row: readonly string[]) => {
    const cells = rowLines(row, widths)
    return cells.map((lineCells) =>
      `│ ${lineCells.map((cell, index) => padCell(cell, widths[index] ?? 1)).join(' │ ')} │`,
    )
  }
  const divider = `├${widths.map((width) => `─${'─'.repeat(width)}─`).join('┼')}┤`
  return [
    `┌${widths.map((width) => `─${'─'.repeat(width)}─`).join('┬')}┐`,
    ...line(header),
    divider,
    ...rows.flatMap(line),
    `└${widths.map((width) => `─${'─'.repeat(width)}─`).join('┴')}┘`,
  ].join('\n')
}

const TABLE_CELL_CAP = 48
const TABLE_MIN_CELL_WIDTH = 8

function tableColumnWidths(
  rows: readonly (readonly string[])[],
  columnCount: number,
  maxColumns: number,
): number[] {
  const separators = 4 + Math.max(0, columnCount - 1) * 3
  const available = Math.max(columnCount, Math.max(1, maxColumns) - separators)
  const preferred = Array.from({ length: columnCount }, (_, column) => {
    const contentWidth = Math.max(
      0,
      ...rows.flatMap((row) =>
        splitCellLines(row[column] ?? '').map((line) => stringWidth(line)),
      ),
    )
    return Math.max(3, Math.min(TABLE_CELL_CAP, contentWidth))
  })
  const minimum = Math.min(TABLE_MIN_CELL_WIDTH, Math.max(1, Math.floor(available / columnCount)))
  const widths = preferred.map((width) => Math.max(minimum, width))
  while (sum(widths) > available) {
    const index = widestShrinkingColumn(widths, minimum)
    if (index === -1) break
    widths[index] -= 1
  }
  return widths
}

function widestShrinkingColumn(widths: readonly number[], minimum: number): number {
  let index = -1
  for (let candidate = 0; candidate < widths.length; candidate += 1) {
    if ((widths[candidate] ?? 0) <= minimum) continue
    if (index === -1 || (widths[candidate] ?? 0) > (widths[index] ?? 0)) index = candidate
  }
  return index
}

function rowLines(row: readonly string[], widths: readonly number[]): string[][] {
  const lines = widths.map((width, column) => wrapCell(row[column] ?? '', width))
  const rowHeight = Math.max(1, ...lines.map((cellLines) => cellLines.length))
  return Array.from({ length: rowHeight }, (_, line) =>
    lines.map((cellLines) => cellLines[line] ?? ''),
  )
}

function wrapCell(value: string, width: number): string[] {
  const normalized = splitCellLines(value).join(' ')
  if (normalized === '') return ['']
  const lines: string[] = []
  let current = ''
  for (const word of normalized.split(/\s+/)) {
    const wordWidth = stringWidth(word)
    if (wordWidth <= width) {
      const next = current === '' ? word : `${current} ${word}`
      if (stringWidth(next) <= width) {
        current = next
        continue
      }
      if (current !== '') lines.push(current)
      current = word
      continue
    }
    if (current !== '') {
      lines.push(current)
      current = ''
    }
    const chunks = hardWrap(word, width)
    lines.push(...chunks.slice(0, -1))
    current = chunks.at(-1) ?? ''
  }
  if (current !== '' || lines.length === 0) lines.push(current)
  return lines
}

function hardWrap(value: string, width: number): string[] {
  const lines: string[] = []
  let current = ''
  let currentWidth = 0
  for (const character of value) {
    const characterWidth = stringWidth(character)
    if (current !== '' && currentWidth + characterWidth > width) {
      lines.push(current)
      current = ''
      currentWidth = 0
    }
    if (characterWidth > width) {
      lines.push('…')
      continue
    }
    current += character
    currentWidth += characterWidth
  }
  if (current !== '' || lines.length === 0) lines.push(current)
  return lines
}

function splitCellLines(value: string): string[] {
  return value.split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== '')
}

function padCell(value: string, width: number): string {
  return `${value}${' '.repeat(Math.max(0, width - stringWidth(value)))}`
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0)
}
