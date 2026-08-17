import stringWidth from 'string-width'
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
      lines.push(...wrapPrefixed(start, item, prefix, width))
      next = start + item.length
    })
    return next
  }
  if (block.kind === 'heading') {
    const start = sourceIndexOf(source, block.text, cursor)
    const prefix = `${'#'.repeat(Math.min(block.depth, 3))} `
    lines.push(...wrapPrefixed(start, block.text, prefix, width))
    return start + block.text.length
  }
  if (block.kind === 'code') {
    const start = sourceIndexOf(source, block.text, cursor)
    if (block.lang !== undefined) lines.push({ start, end: start })
    const prefix = `${glyphs.quoteRail} `
    let lineStart = start
    for (const [index, line] of block.text.split('\n').entries()) {
      if (index > 0) lineStart += 1
      lines.push(...wrapPrefixed(lineStart, line, prefix, width))
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
      lines.push(...wrapPrefixed(lineStart, line, prefix, width))
      lineStart += line.length
    }
    return start + block.text.length
  }
  if (block.kind === 'table') {
    const start = sourceIndexOf(source, block.header[0] ?? '', cursor)
    const table = renderTable(block.header, block.rows, width)
    const end = Math.max(start, cursor)
    const tableRows = table.split('\n').length
    for (let row = 0; row < tableRows; row += 1) {
      lines.push({ start, end: end + table.length })
    }
    return end
  }
  if (block.kind === 'rule') {
    lines.push({ start: cursor, end: cursor })
    return cursor
  }
  const body = block.text
  const start = sourceIndexOf(source, body, cursor)
  lines.push(...shiftLines(wrapPlainText(body, width), start))
  return start + body.length
}

function wrapPrefixed(
  sourceStart: number,
  body: string,
  prefix: string,
  columns: number,
): WrappedLine[] {
  const visual = `${prefix}${body}`
  return wrapPlainText(visual, columns).map((line) => {
    const bodyStart = Math.max(0, line.start - prefix.length)
    const bodyEnd = Math.max(0, line.end - prefix.length)
    const indent =
      line.start < prefix.length ? stringWidth(visual.slice(line.start, prefix.length)) : 0
    return {
      start: sourceStart + bodyStart,
      end: sourceStart + bodyEnd,
      ...(indent > 0 ? { indent } : {}),
    }
  })
}

function shiftLines(lines: readonly WrappedLine[], offset: number): WrappedLine[] {
  if (offset === 0) return [...lines]
  return lines.map((line) => ({
    start: line.start + offset,
    end: line.end + offset,
    ...(line.indent !== undefined ? { indent: line.indent } : {}),
  }))
}

export function sourceIndexOf(source: string, snippet: string, from: number): number {
  if (snippet === '') return from
  const index = source.indexOf(snippet, from)
  return index < 0 ? from : index
}
