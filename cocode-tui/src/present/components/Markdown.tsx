import { marked, type Token, type Tokens } from 'marked'
import { Box, Text } from 'ink'
import type { ReactNode } from 'react'
import { memo, useMemo, useRef } from 'react'
import stringWidth from 'string-width'
import { glyphs } from '../glyphs.ts'
import { theme } from '../theme.ts'
import type { MessageTextRange } from '../message-text-selection.ts'
import { SelectableText } from './SelectableText.tsx'

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

export const Markdown = memo(function Markdown(props: {
  text: string
  maxColumns?: number
  selection?: MessageTextRange
}) {
  const blocks = useMemo(() => parseMarkdownBlocks(props.text), [props.text])
  let sourceCursor = 0
  return (
    <Box flexDirection="column" flexShrink={0}>
      {blocks.map((block, index) => {
        const sourceOffset = blockSourceOffset(props.text, block, sourceCursor)
        sourceCursor = sourceOffset + blockSourceText(block).length
        return (
          <MarkdownBlockView
            block={block}
            key={`${block.kind}:${index}`}
            maxColumns={props.maxColumns}
            selection={props.selection}
            sourceOffset={sourceOffset}
            sourceText={props.text}
          />
        )
      })}
    </Box>
  )
})

export function StreamingMarkdown(props: {
  text: string
  maxColumns?: number
  selection?: MessageTextRange
}) {
  const stablePrefix = useRef('')
  const split = useMemo(
    () => splitStreamingMarkdown(props.text, stablePrefix.current),
    [props.text],
  )
  stablePrefix.current = split.stablePrefix
  return (
    <Box flexDirection="column">
      {split.stablePrefix !== '' ? (
        <Markdown
          text={split.stablePrefix}
          maxColumns={props.maxColumns}
          selection={props.selection}
        />
      ) : null}
      {split.unstableSuffix !== '' ? (
        <Markdown
          text={split.unstableSuffix}
          maxColumns={props.maxColumns}
          selection={props.selection}
        />
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
    if (
      blockCache.size >= BLOCK_CACHE_LIMIT ||
      blockCacheChars + text.length > BLOCK_CACHE_CHARS
    ) {
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
    while (lastContent >= 0 && tokens[lastContent]?.type === 'space')
      lastContent -= 1
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
      return [
        {
          kind: 'code',
          text: token.text,
          ...(token.lang ? { lang: token.lang } : {}),
        },
      ]
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

function MarkdownBlockView(props: {
  block: MarkdownBlock
  maxColumns?: number
  selection?: MessageTextRange
  sourceOffset: number
  sourceText: string
}) {
  const { block } = props
  if (block.kind === 'heading') {
    return (
      <Text color={theme.text} bold wrap="wrap">
        <Text color={theme.mute}>{'#'.repeat(Math.min(block.depth, 3))}</Text>{' '}
        {renderInline(block.text, props.selection, props.sourceOffset)}
      </Text>
    )
  }
  // A rail costs one column and no rows; a box border costs two of each, which
  // a narrow terminal cannot spare. The design system draws code as a sunken
  // surface, and a surface is exactly what a terminal cannot provide.
  if (block.kind === 'code') {
    return (
      <Box flexDirection="column">
        {block.lang ? <Text color={theme.mute}>{block.lang}</Text> : null}
        <RailedLines
          text={block.text}
          color={theme.dim}
          selection={props.selection}
          sourceOffset={props.sourceOffset}
        />
      </Box>
    )
  }
  if (block.kind === 'list') {
    let itemCursor = props.sourceOffset
    const columns = Math.max(1, props.maxColumns ?? 80)
    return (
      <Box flexDirection="column" flexShrink={0}>
        {block.items.map((item, index) => {
          const itemOffset = sourceIndexOf(props.sourceText, item, itemCursor)
          itemCursor = itemOffset + item.length
          const prefix = `${block.ordered ? `${index + 1}.` : glyphs.listBullet} `
          return (
            <ListItemLines
              key={`${index}:${item}`}
              item={item}
              prefix={prefix}
              columns={columns}
              selection={props.selection}
              sourceOffset={itemOffset}
            />
          )
        })}
      </Box>
    )
  }
  if (block.kind === 'quote') {
    return (
      <RailedLines
        text={block.text}
        color={theme.dim}
        markdown
        selection={props.selection}
        sourceOffset={props.sourceOffset}
      />
    )
  }
  if (block.kind === 'table') {
    return (
      <Text color={theme.text} wrap="truncate-end">
        {renderTable(block.header, block.rows, props.maxColumns)}
      </Text>
    )
  }
  if (block.kind === 'rule')
    return <Text color={theme.border}>{glyphs.rule.repeat(24)}</Text>
  return (
    <Box width={Math.max(1, props.maxColumns ?? 80)} minWidth={0}>
      <Text color={theme.text} wrap="wrap">
        {renderInline(block.text, props.selection, props.sourceOffset)}
      </Text>
    </Box>
  )
}

/** Paint one list item with the same wrapPlainText rows hit-testing uses. */
function ListItemLines(props: {
  item: string
  prefix: string
  columns: number
  selection?: MessageTextRange
  sourceOffset: number
}) {
  return (
    <Box width={props.columns} minWidth={0} flexShrink={0}>
      <Text wrap="wrap">
        <Text color={theme.mute}>{props.prefix}</Text>
        {renderInline(props.item, props.selection, props.sourceOffset)}
      </Text>
    </Box>
  )
}

/** Left rail repeated per line, so a multi-line block reads as one region. */
function RailedLines(props: {
  text: string
  color: string
  markdown?: boolean
  selection?: MessageTextRange
  sourceOffset: number
}) {
  let offset = props.sourceOffset
  return (
    <Box flexDirection="column">
      {props.text
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .map((line, index) => {
          const lineOffset = offset
          offset += line.length + 1
          return (
            <Text key={`${index}:${line}`} wrap="wrap">
              <Text color={theme.border}>{glyphs.quoteRail} </Text>
              <Text color={props.color}>
                {props.markdown === true ? (
                  renderInline(line, props.selection, lineOffset)
                ) : (
                  <SelectableText
                    text={line}
                    selection={localSelection(
                      props.selection,
                      lineOffset,
                      line.length,
                    )}
                  />
                )}
              </Text>
            </Text>
          )
        })}
    </Box>
  )
}

function renderInline(
  text: string,
  selection?: MessageTextRange,
  sourceOffset = 0,
): ReactNode {
  try {
    return renderInlineTokens(
      marked.Lexer.lexInline(text),
      text,
      selection,
      sourceOffset,
    )
  } catch {
    return (
      <SelectableText
        text={text}
        selection={localSelection(selection, sourceOffset, text.length)}
      />
    )
  }
}

function renderInlineTokens(
  tokens: readonly Token[],
  source: string,
  selection: MessageTextRange | undefined,
  sourceOffset: number,
): ReactNode[] {
  const nodes: ReactNode[] = []
  let cursor = 0
  for (const [index, token] of tokens.entries()) {
    const raw = token.raw ?? ''
    const relativeStart = sourceIndexOf(source, raw, cursor)
    const tokenOffset = sourceOffset + relativeStart
    const nested = 'tokens' in token && Array.isArray(token.tokens)
      ? token.tokens
      : undefined
    const key = `${relativeStart}:${token.type}:${index}`

    if (token.type === 'strong' && nested !== undefined) {
      nodes.push(
        <Text key={key} bold>
          {renderInlineTokens(nested, raw, selection, tokenOffset)}
        </Text>,
      )
    } else if (token.type === 'em' && nested !== undefined) {
      nodes.push(
        <Text key={key} italic>
          {renderInlineTokens(nested, raw, selection, tokenOffset)}
        </Text>,
      )
    } else if (token.type === 'del' && nested !== undefined) {
      nodes.push(
        <Text key={key} strikethrough>
          {renderInlineTokens(nested, raw, selection, tokenOffset)}
        </Text>,
      )
    } else if (token.type === 'link' && nested !== undefined) {
      nodes.push(
        <Text key={key} color={theme.accent} underline>
          {renderInlineTokens(nested, raw, selection, tokenOffset)}
        </Text>,
      )
    } else if (token.type === 'codespan') {
      nodes.push(
        <Text key={key} color={theme.accent}>
          {selectableTokenText(token.text, raw, selection, tokenOffset)}
        </Text>,
      )
    } else if (token.type === 'image') {
      nodes.push(
        <Text key={key} color={theme.accent}>
          {selectableTokenText(token.text, raw, selection, tokenOffset)}
        </Text>,
      )
    } else if (token.type === 'br') {
      nodes.push('\n')
    } else if (nested !== undefined) {
      nodes.push(
        <Text key={key}>
          {renderInlineTokens(nested, raw, selection, tokenOffset)}
        </Text>,
      )
    } else {
      const value = 'text' in token && typeof token.text === 'string'
        ? token.text
        : raw
      nodes.push(
        <SelectableText
          key={key}
          text={value}
          selection={tokenSelection(value, raw, selection, tokenOffset)}
        />,
      )
    }
    cursor = relativeStart + raw.length
  }
  return nodes
}

function selectableTokenText(
  text: string,
  raw: string,
  selection: MessageTextRange | undefined,
  sourceOffset: number,
): ReactNode {
  return (
    <SelectableText
      text={text}
      selection={tokenSelection(text, raw, selection, sourceOffset)}
    />
  )
}

function tokenSelection(
  text: string,
  raw: string,
  selection: MessageTextRange | undefined,
  sourceOffset: number,
): MessageTextRange | undefined {
  const inner = raw.indexOf(text)
  return localSelection(
    selection,
    sourceOffset + (inner < 0 ? 0 : inner),
    text.length,
  )
}

function blockSourceText(block: MarkdownBlock): string {
  switch (block.kind) {
    case 'list':
      return block.items.join('\n')
    case 'table':
      return [...block.header, ...block.rows.flat()].join(' ')
    case 'rule':
      return ''
    default:
      return block.text
  }
}

function blockSourceOffset(
  text: string,
  block: MarkdownBlock,
  from: number,
): number {
  const source = blockSourceText(block)
  if (source === '') return from
  const index = text.indexOf(source, from)
  return index < 0 ? from : index
}

function sourceIndexOf(source: string, snippet: string, from: number): number {
  if (snippet === '') return from
  const index = source.indexOf(snippet, from)
  return index < 0 ? from : index
}

function localSelection(
  selection: MessageTextRange | undefined,
  sourceStart: number,
  length: number,
): MessageTextRange | undefined {
  if (selection === undefined || length <= 0) return undefined
  const sourceEnd = sourceStart + length
  const start = Math.max(selection.start, sourceStart)
  const end = Math.min(selection.end, sourceEnd)
  return start < end
    ? { start: start - sourceStart, end: end - sourceStart }
    : undefined
}

/**
 * Columns are separated by whitespace and the header by a single rule, matching
 * the design system's table (§4.6), which has no vertical lines and no outer
 * frame. Dropping them also returns four columns per table to the content.
 */
export const TABLE_COLUMN_GAP = '  '

export function renderTable(
  header: readonly string[],
  rows: readonly (readonly string[])[],
  maxColumns = 80,
): string {
  const renderedHeader = header.map(inlineMarkdownText)
  const renderedRows = rows.map((row) => row.map(inlineMarkdownText))
  const columnCount = Math.max(
    renderedHeader.length,
    ...renderedRows.map((row) => row.length),
    1,
  )
  const allRows = [renderedHeader, ...renderedRows]
  const widths = tableColumnWidths(allRows, columnCount, maxColumns)
  const line = (row: readonly string[]) =>
    rowLines(row, widths).map((lineCells) =>
      lineCells
        .map((cell, index) => padCell(cell, widths[index] ?? 1))
        .join(TABLE_COLUMN_GAP)
        .trimEnd(),
    )
  const divider = widths
    .map((width) => glyphs.rule.repeat(width))
    .join(TABLE_COLUMN_GAP)
  return [...line(renderedHeader), divider, ...renderedRows.flatMap(line)].join('\n')
}

/** Plain terminal projection used where a block cannot carry nested Ink styles. */
export function inlineMarkdownText(text: string): string {
  try {
    return inlineTokensText(marked.Lexer.lexInline(text))
  } catch {
    return text
  }
}

function inlineTokensText(tokens: readonly Token[]): string {
  return tokens.map((token) => {
    if (token.type === 'br') return '\n'
    if (token.type === 'image') return token.text
    const nested = 'tokens' in token && Array.isArray(token.tokens)
      ? token.tokens
      : undefined
    if (nested !== undefined) return inlineTokensText(nested)
    return 'text' in token && typeof token.text === 'string'
      ? token.text
      : token.raw ?? ''
  }).join('')
}

const TABLE_CELL_CAP = 48
const TABLE_MIN_CELL_WIDTH = 8

function tableColumnWidths(
  rows: readonly (readonly string[])[],
  columnCount: number,
  maxColumns: number,
): number[] {
  const separators = Math.max(0, columnCount - 1) * TABLE_COLUMN_GAP.length
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
  const minimum = Math.min(
    TABLE_MIN_CELL_WIDTH,
    Math.max(1, Math.floor(available / columnCount)),
  )
  const widths = preferred.map((width) => Math.max(minimum, width))
  while (sum(widths) > available) {
    const index = widestShrinkingColumn(widths, minimum)
    if (index === -1) break
    widths[index] -= 1
  }
  return widths
}

function widestShrinkingColumn(
  widths: readonly number[],
  minimum: number,
): number {
  let index = -1
  for (let candidate = 0; candidate < widths.length; candidate += 1) {
    if ((widths[candidate] ?? 0) <= minimum) continue
    if (index === -1 || (widths[candidate] ?? 0) > (widths[index] ?? 0))
      index = candidate
  }
  return index
}

function rowLines(
  row: readonly string[],
  widths: readonly number[],
): string[][] {
  const lines = widths.map((width, column) =>
    wrapCell(row[column] ?? '', width),
  )
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
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '')
}

function padCell(value: string, width: number): string {
  return `${value}${' '.repeat(Math.max(0, width - stringWidth(value)))}`
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0)
}
