import stringWidth from 'string-width'
import { marked, type Token } from 'marked'
import { graphemeSegments } from '../runtime/grapheme.ts'
import { parseMarkdownBlocks, renderTable, type MarkdownBlock } from './components/Markdown.tsx'
import { glyphs } from './glyphs.ts'
import { wrapPlainText, type WrappedLine } from './text-wrap.ts'

/** Visual rows for Markdown, matching Markdown.tsx rather than raw source wrap. */
export function layoutMarkdownSource(text: string, columns: number): WrappedLine[] {
  const width = Math.max(1, Math.trunc(columns))
  const normalized = text.replace(/\r\n?/g, '\n')
  const lines: WrappedLine[] = []
  let cursor = 0
  for (const block of parseMarkdownBlocks(normalized)) {
    cursor = appendBlock(lines, normalized, block, cursor, width)
  }
  return lines.length === 0 ? [{ start: 0, end: normalized.length }] : lines
}

export function countMarkdownRows(text: string | undefined, columns?: number): number {
  if (text === undefined || text === '') return 0
  return layoutMarkdownSource(text, columns ?? 1000).length
}

function appendBlock(
  lines: WrappedLine[],
  source: string,
  block: MarkdownBlock,
  cursor: number,
  width: number,
): number {
  if (block.kind === 'list') {
    let next = cursor
    block.items.forEach((item, index) => {
      const start = sourceIndexOf(source, item, next)
      const prefix = `${block.ordered ? `${index + 1}.` : glyphs.listBullet} `
      lines.push(...wrapPrefixed(start, projectInline(item, start), prefix, width))
      next = start + item.length
    })
    return next
  }
  if (block.kind === 'heading') {
    const start = sourceIndexOf(source, block.text, cursor)
    const prefix = `${'#'.repeat(Math.min(block.depth, 3))} `
    lines.push(...wrapPrefixed(start, projectInline(block.text, start), prefix, width))
    return start + block.text.length
  }
  if (block.kind === 'code') {
    const start = sourceIndexOf(source, block.text, cursor)
    if (block.lang !== undefined) lines.push({ start, end: start })
    const prefix = `${glyphs.quoteRail} `
    let lineStart = start
    for (const [index, line] of block.text.split('\n').entries()) {
      if (index > 0) lineStart += 1
      lines.push(...wrapPrefixed(lineStart, identityProjection(line, lineStart), prefix, width))
      lineStart += line.length
    }
    return start + block.text.length
  }
  if (block.kind === 'quote') {
    const start = sourceIndexOf(source, block.text, cursor)
    const prefix = `${glyphs.quoteRail} `
    let lineStart = start
    for (const [index, line] of block.text.split('\n').entries()) {
      if (index > 0) lineStart += 1
      lines.push(...wrapPrefixed(lineStart, projectInline(line, lineStart), prefix, width))
      lineStart += line.length
    }
    return start + block.text.length
  }
  if (block.kind === 'table') {
    const start = sourceIndexOf(source, block.header[0] ?? '', cursor)
    const table = renderTable(block.header, block.rows, width)
    const end = Math.max(start, cursor)
    const tableLines = table.split('\n')
    const tableMap = tableSourceMap(block, source, start, table)
    let tableOffset = 0
    for (const tableLine of tableLines) {
      const lineMap = tableMap.slice(tableOffset, tableOffset + tableLine.length)
      const lineStart = lineMap[0] ?? start
      const lineEnd = lineMap.length > 0
        ? (lineMap.at(-1) ?? lineStart) + 1
        : lineStart
      lines.push({
        start: lineStart,
        end: lineEnd,
        visual: tableLine,
        sourceMap: lineMap,
        sourceEnd: lineEnd,
      })
      tableOffset += tableLine.length + 1
    }
    const lastCell = block.rows.at(-1)?.at(-1) ?? block.header.at(-1) ?? ''
    return lastCell === ''
      ? Math.max(end, cursor)
      : sourceIndexOf(source, lastCell, cursor) + lastCell.length
  }
  if (block.kind === 'rule') {
    lines.push({ start: cursor, end: cursor })
    return cursor
  }
  const body = block.text
  const start = sourceIndexOf(source, body, cursor)
  lines.push(...wrapMapped(projectInline(body, start), width))
  return start + body.length
}

function wrapPrefixed(
  sourceStart: number,
  body: MappedText,
  prefix: string,
  columns: number,
): WrappedLine[] {
  const visual = `${prefix}${body.text}`
  return wrapPlainText(visual, columns).map((line) => {
    const bodyStart = Math.max(0, line.start - prefix.length)
    const bodyEnd = Math.max(0, line.end - prefix.length)
    const bodyVisual = body.text.slice(bodyStart, bodyEnd)
    const bodyMap = body.sourceMap.slice(bodyStart, bodyEnd)
    const indent = line.start < prefix.length
      ? stringWidth(visual.slice(line.start, Math.min(prefix.length, line.end)))
      : 0
    const mappedStart = bodyMap[0] ?? sourceStart
    const mappedEnd = bodyMap.length > 0
      ? (bodyMap.at(-1) ?? mappedStart) + 1
      : mappedStart
    const sourceEnd = bodyEnd >= body.text.length
      ? body.sourceEnd
      : body.sourceMap[bodyEnd] ?? mappedEnd
    return {
      start: mappedStart,
      end: mappedEnd,
      ...(indent > 0 ? { indent } : {}),
      visual: bodyVisual,
      sourceMap: bodyMap,
      sourceEnd,
    }
  })
}

function wrapMapped(body: MappedText, columns: number): WrappedLine[] {
  return wrapPlainText(body.text, columns).map((line) => {
    const start = body.sourceMap[line.start] ?? body.sourceEnd
    const end = body.sourceMap[line.end - 1] !== undefined
      ? (body.sourceMap[line.end - 1] ?? body.sourceEnd) + 1
      : body.sourceEnd
    return {
      start,
      end,
      visual: body.text.slice(line.start, line.end),
      sourceMap: body.sourceMap.slice(line.start, line.end),
      sourceEnd: line.end >= body.text.length
        ? body.sourceEnd
        : body.sourceMap[line.end] ?? end,
    }
  })
}

type MappedText = {
  text: string
  sourceMap: number[]
  sourceEnd: number
}

function identityProjection(text: string, sourceStart: number): MappedText {
  return {
    text,
    sourceMap: Array.from({ length: text.length }, (_, index) => sourceStart + index),
    sourceEnd: sourceStart + text.length,
  }
}

function projectInline(text: string, sourceStart: number): MappedText {
  try {
    return projectInlineTokens(marked.Lexer.lexInline(text), text, sourceStart)
  } catch {
    return identityProjection(text, sourceStart)
  }
}

function projectInlineTokens(
  tokens: readonly Token[],
  source: string,
  sourceStart: number,
): MappedText {
  const result: MappedText = { text: '', sourceMap: [], sourceEnd: sourceStart }
  let cursor = 0
  for (const token of tokens) {
    const raw = token.raw ?? ''
    const relativeStart = sourceIndexOf(source, raw, cursor)
    const tokenStart = sourceStart + relativeStart
    const nested = 'tokens' in token && Array.isArray(token.tokens)
      ? token.tokens
      : undefined
    let part: MappedText
    if (nested !== undefined) {
      part = projectInlineTokens(nested, raw, tokenStart)
    } else if (token.type === 'br') {
      part = identityProjection('\n', tokenStart)
    } else {
      const value = token.type === 'image'
        ? token.text
        : 'text' in token && typeof token.text === 'string'
          ? token.text
          : raw
      const innerStart = value === raw ? tokenStart : tokenStart + Math.max(0, raw.indexOf(value))
      part = mapVisibleText(value, raw, innerStart)
    }
    result.text += part.text
    result.sourceMap.push(...part.sourceMap)
    result.sourceEnd = Math.max(result.sourceEnd, part.sourceEnd)
    cursor = relativeStart + raw.length
  }
  return result
}

function mapVisibleText(visible: string, source: string, sourceStart: number): MappedText {
  const visibleGraphemes = [...graphemeSegments(visible)]
  const sourceGraphemes = [...graphemeSegments(source)]
  const sourceMap: number[] = []
  for (const [index, visibleGrapheme] of visibleGraphemes.entries()) {
    const sourceOffset = sourceStart + (sourceGraphemes[index]?.index ?? 0)
    sourceMap.push(
      ...Array.from(
        { length: visibleGrapheme.segment.length },
        (_, offset) => sourceOffset + offset,
      ),
    )
  }
  return {
    text: visible,
    sourceMap,
    sourceEnd: sourceStart + source.length,
  }
}

function tableSourceMap(
  block: Extract<MarkdownBlock, { kind: 'table' }>,
  source: string,
  sourceStart: number,
  rendered: string,
): number[] {
  const cells = [block.header, ...block.rows].flat()
  let cursor = sourceStart
  const entries = cells.map((cell) => {
    const rawStart = sourceIndexOf(source, cell, cursor)
    cursor = rawStart + cell.length
    const visible = projectInline(cell, rawStart)
    return { ...visible, sourceStart: rawStart }
  })
  const map = Array.from({ length: rendered.length }, () => sourceStart)
  let searchFrom = 0
  for (const entry of entries) {
    if (entry.text === '') continue
    const visibleStart = rendered.indexOf(entry.text, searchFrom)
    if (visibleStart < 0) continue
    for (let index = 0; index < entry.text.length; index += 1) {
      map[visibleStart + index] = entry.sourceMap[index] ?? entry.sourceStart
    }
    searchFrom = visibleStart + entry.text.length
  }
  return map
}

export function sourceIndexOf(source: string, snippet: string, from: number): number {
  if (snippet === '') return from
  const index = source.indexOf(snippet, from)
  return index < 0 ? from : index
}
