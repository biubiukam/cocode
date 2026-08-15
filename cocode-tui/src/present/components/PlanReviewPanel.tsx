import { Box, Text, useInput } from 'ink'
import { useEffect, useMemo, useState } from 'react'
import stringWidth from 'string-width'
import type { TuiQuestionSnapshot, TuiAction } from '../../runtime/app.ts'
import { parseMarkdownBlocks, renderTable } from './Markdown.tsx'
import { text, type UiLocale } from '../../runtime/ui-locale.ts'
import { theme } from '../theme.ts'
import type { TuiMousePointer } from '../mouse.ts'

const PANEL_CHROME_ROWS = 7
const MAX_RESERVED_PREVIEW_ROWS = 18
const MAX_PLAN_LINES = 240

type PlanLineKind = 'heading' | 'body' | 'bullet' | 'code' | 'quote' | 'rule' | 'spacer'

export type PlanPreviewLine = {
  kind: PlanLineKind
  text: string
}

export function isPlanReviewQuestion(question: TuiQuestionSnapshot['question']): boolean {
  return question.intent?.kind === 'plan-review'
}

export function buildPlanPreview(markdown: string, maxColumns = 80): readonly PlanPreviewLine[] {
  const width = Math.max(20, Math.trunc(maxColumns))
  const lines: PlanPreviewLine[] = []
  const blocks = parseMarkdownBlocks(markdown)

  for (const block of blocks) {
    if (block.kind === 'heading') {
      appendWrapped(lines, 'heading', `${'#'.repeat(Math.min(block.depth, 3))} ${block.text}`, width)
    } else if (block.kind === 'paragraph') {
      appendWrapped(lines, 'body', block.text, width)
    } else if (block.kind === 'list') {
      block.items.forEach((item, index) => {
        appendWrapped(lines, 'bullet', `${block.ordered ? `${index + 1}.` : '•'} ${item}`, width)
      })
    } else if (block.kind === 'code') {
      if (block.lang !== undefined) appendWrapped(lines, 'code', `[${block.lang}]`, width)
      for (const codeLine of block.text.split(/\r?\n/)) {
        appendWrapped(lines, 'code', `│ ${codeLine}`, width)
      }
    } else if (block.kind === 'quote') {
      appendWrapped(lines, 'quote', `│ ${block.text}`, width)
    } else if (block.kind === 'table') {
      for (const tableLine of renderTable(block.header, block.rows, width).split('\n')) {
        appendWrapped(lines, 'code', tableLine, width)
      }
    } else if (block.kind === 'rule') {
      lines.push({ kind: 'rule', text: '─'.repeat(Math.min(24, width)) })
    } else if (block.kind === 'text') {
      appendWrapped(lines, 'body', block.text, width)
    }
    if (lines.at(-1)?.kind !== 'spacer') lines.push({ kind: 'spacer', text: '' })
    if (lines.length >= MAX_PLAN_LINES) break
  }

  while (lines.at(-1)?.kind === 'spacer') lines.pop()
  return lines.slice(0, MAX_PLAN_LINES)
}

export function planReviewPanelRows(state: TuiQuestionSnapshot, maxColumns = 80): number {
  const previewLines = buildPlanPreview(state.question.detail ?? '', maxColumns)
  const optionRows = Math.max(1, state.question.options?.length ?? 0)
  return PANEL_CHROME_ROWS + Math.min(MAX_RESERVED_PREVIEW_ROWS, Math.max(3, previewLines.length)) + optionRows
}

export function planReviewActionIndexAtRow(props: {
  row: number
  panelStartRow: number
  previewRows: number
  hasAbove: boolean
  hasBelow: boolean
  optionCount: number
}): number | undefined {
  const firstActionRow =
    props.panelStartRow +
    4 +
    Number(props.hasAbove) +
    props.previewRows +
    Number(props.hasBelow)
  const index = props.row - firstActionRow
  return index >= 0 && index < props.optionCount ? index : undefined
}

export function PlanReviewPanel(props: {
  state: TuiQuestionSnapshot
  locale: UiLocale
  panelStartRow: number
  maxRows?: number
  maxColumns?: number
  mousePointer?: TuiMousePointer
  dispatch: (action: TuiAction) => void
}) {
  const question = props.state.question
  const options = question.options ?? []
  const preview = useMemo(
    () => buildPlanPreview(question.detail ?? '', Math.max(20, (props.maxColumns ?? 80) - 4)),
    [props.maxColumns, question.detail],
  )
  const previewRows = Math.max(
    1,
    Math.min(
      preview.length || 1,
      Math.max(1, Math.min(MAX_RESERVED_PREVIEW_ROWS, Math.trunc(props.maxRows ?? 16) - PANEL_CHROME_ROWS - options.length)),
    ),
  )
  const [scrollOffset, setScrollOffset] = useState(0)
  const [selected, setSelected] = useState(0)
  const maxOffset = Math.max(0, preview.length - previewRows)
  const visible = preview.slice(scrollOffset, scrollOffset + previewRows)
  const hasAbove = scrollOffset > 0
  const hasBelow = scrollOffset < maxOffset

  useEffect(() => {
    setScrollOffset((current) => Math.min(current, maxOffset))
  }, [maxOffset])

  useEffect(() => {
    const pointer = props.mousePointer
    if (pointer === undefined) return
    const index = planReviewActionIndexAtRow({
      row: pointer.row,
      panelStartRow: props.panelStartRow,
      previewRows,
      hasAbove,
      hasBelow,
      optionCount: options.length,
    })
    if (index === undefined) return
    setSelected(index)
    if (pointer.action === 'press') {
      const option = options[index]
      if (option !== undefined) props.dispatch({ type: 'question.answer', selected: [option.label] })
    }
  }, [hasAbove, hasBelow, options, previewRows, props])

  useInput((input, key) => {
    if (key.escape || (key.ctrl && input === 'c')) {
      props.dispatch({ type: 'question.cancel' })
      return
    }
    if (key.pageUp || (key.ctrl && input === 'u')) {
      setScrollOffset((current) => Math.max(0, current - Math.max(1, previewRows - 1)))
      return
    }
    if (key.pageDown || (key.ctrl && input === 'd')) {
      setScrollOffset((current) => Math.min(maxOffset, current + Math.max(1, previewRows - 1)))
      return
    }
    if (key.upArrow) {
      setSelected((current) => (current - 1 + Math.max(1, options.length)) % Math.max(1, options.length))
      return
    }
    if (key.downArrow || key.tab) {
      setSelected((current) => (current + 1) % Math.max(1, options.length))
      return
    }
    if (!key.return) return
    const option = options[selected]
    if (option !== undefined) props.dispatch({ type: 'question.answer', selected: [option.label] })
  })

  return (
    <Box
      flexDirection="column"
      marginTop={1}
      borderStyle="round"
      borderColor={theme.info}
      paddingX={1}
    >
      <Text color={theme.info} bold wrap="truncate-end">
        {text(props.locale, 'planReviewTitle')}{' '}
        <Text color={theme.mute}>
          · {props.state.position}/{props.state.total} · {text(props.locale, 'planReviewHint')}
        </Text>
      </Text>
      <Text color={theme.text} wrap="truncate-end">
        {question.question}
      </Text>
      <Text color={theme.dim} wrap="truncate-end">
        {text(props.locale, 'planReviewPreview')}
      </Text>
      {hasAbove ? <Text color={theme.mute}>↑ {scrollOffset} more</Text> : null}
      <Box flexDirection="column" height={previewRows} overflowY="hidden">
        {visible.length > 0 ? visible.map((line, index) => <PlanLine key={`${scrollOffset}:${index}`} line={line} />) : (
          <Text color={theme.mute}>{text(props.locale, 'planReviewEmpty')}</Text>
        )}
      </Box>
      {hasBelow ? <Text color={theme.mute}>↓ {maxOffset - scrollOffset} more</Text> : null}
      {options.map((option, index) => {
        const active = selected === index
        return (
          <Box key={option.label} flexDirection="column">
            <Text color={active ? theme.text : theme.mute} inverse={active} wrap="truncate-end">
              {active ? '›' : ' '} {active ? '●' : '○'} {option.label}
            </Text>
            {option.description !== undefined ? (
              <Text color={theme.dim} wrap="truncate-end">
                {' '}
                {option.description}
              </Text>
            ) : null}
          </Box>
        )
      })}
      <Text color={theme.dim} wrap="truncate-end">
        {text(props.locale, 'planReviewFooter')}
      </Text>
    </Box>
  )
}

function PlanLine(props: { line: PlanPreviewLine }) {
  const color =
    props.line.kind === 'heading'
      ? theme.brand
      : props.line.kind === 'bullet'
      ? theme.text
      : props.line.kind === 'code' || props.line.kind === 'quote'
      ? theme.dim
      : props.line.kind === 'rule'
      ? theme.border
      : theme.assistant
  return (
    <Text color={color} bold={props.line.kind === 'heading'} wrap="truncate-end">
      {props.line.text}
    </Text>
  )
}

function appendWrapped(lines: PlanPreviewLine[], kind: PlanLineKind, value: string, width: number): void {
  const normalized = value.replace(/\r/g, '')
  const sourceLines = normalized === '' ? [''] : normalized.split('\n')
  for (const sourceLine of sourceLines) {
    const wrapped = wrapLine(sourceLine, width)
    for (const line of wrapped) lines.push({ kind, text: line })
  }
}

function wrapLine(value: string, width: number): string[] {
  if (value === '') return ['']
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
    current += character
    currentWidth += characterWidth
  }
  if (current !== '') lines.push(current)
  return lines.length > 0 ? lines : ['']
}
