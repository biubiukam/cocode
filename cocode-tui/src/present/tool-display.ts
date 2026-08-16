import stringWidth from 'string-width'
import type { ToolNode } from '../runtime/nodes/types.ts'
import { toolViewPrimaryDetail } from '../runtime/nodes/tool-view.ts'
import { theme } from './theme.ts'
import { sanitizeSingleLine } from './text-format.ts'

export type ToolSummary = {
  mark: string
  statusLabel: string
  name: string
  primaryDetail?: string
  elapsed?: string
  tone: 'info' | 'success' | 'error'
}

export type ToolDisplayState = {
  mark: string
  color: string
  label: string
}

export function toolDisplayState(
  node: Pick<ToolNode, 'status'>,
  locale: 'en' | 'zh',
): ToolDisplayState {
  if (node.status === 'running') {
    return {
      mark: theme.pendingIcon,
      color: theme.pending,
      label: locale === 'zh' ? '运行中' : 'running',
    }
  }
  if (node.status === 'error') {
    return {
      mark: theme.errorIcon,
      color: theme.error,
      label: locale === 'zh' ? '失败' : 'error',
    }
  }
  return {
    mark: theme.successIcon,
    color: theme.success,
    label: locale === 'zh' ? '完成' : 'done',
  }
}

export function projectToolSummary(
  node: ToolNode,
  locale: 'en' | 'zh',
  columns: number,
  now: number,
): ToolSummary {
  const state = toolDisplayState(node, locale)
  const tone = node.status === 'error' ? 'error' : node.status === 'success' ? 'success' : 'info'
  const fallbackName = locale === 'zh' ? '工具' : 'tool'
  const rawName = sanitizeSingleLine(node.name) || fallbackName
  const primary = selectPrimaryDetail(node)
  const width = Math.max(1, Math.trunc(columns))
  const elapsedCandidate = node.status === 'running' ? formatElapsed(node.time, now) : undefined
  const chromeWidth = stringWidth(`↳ ${state.mark}  · ${state.label}`)
  const primaryReserve =
    primary === undefined ? 0 : stringWidth(' · ') + Math.min(16, stringWidth(primary))
  const nameBudget = Math.max(1, Math.min(32, width - chromeWidth - primaryReserve))
  const name = truncateCellWidth(rawName, nameBudget)
  const baseWidth = stringWidth(`↳ ${state.mark} ${name} · ${state.label}`)
  const detailReserve = primary === undefined ? 0 : stringWidth(' · …')
  const elapsed =
    elapsedCandidate !== undefined &&
    baseWidth + stringWidth(` · ${elapsedCandidate}`) + detailReserve <= width
      ? elapsedCandidate
      : undefined
  const usedWidth = baseWidth + (elapsed === undefined ? 0 : stringWidth(` · ${elapsed}`))
  const detailBudget = width - usedWidth - stringWidth(' · ')
  const primaryDetail =
    primary === undefined || detailBudget < 2
      ? undefined
      : truncateCellWidth(primary, detailBudget)
  return {
    mark: state.mark,
    statusLabel: state.label,
    name,
    primaryDetail,
    elapsed,
    tone,
  }
}

export function toolArgumentSummary(args: string, maxColumns = 72): string | undefined {
  const singleLine = sanitizeSingleLine(redactSensitiveArguments(args))
  if (singleLine === '' || singleLine === '{}') return undefined
  return truncateCellWidth(singleLine, maxColumns)
}

export function formatElapsed(startTime: number, now = Date.now()): string | undefined {
  if (!Number.isFinite(startTime) || startTime <= 0) return undefined
  const elapsedMs = Math.max(0, now - startTime)
  if (elapsedMs < 1000) return '<1s'
  const seconds = Math.floor(elapsedMs / 1000)
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

export function toolErrorSummary(error: ToolNode['error']): string | undefined {
  if (error === undefined) return undefined
  const name = sanitizeSingleLine(error.name)
  const code = sanitizeSingleLine(error.code)
  const detail = name === '' ? code : code === '' || code === name ? name : `${name} (${code})`
  return detail === '' ? undefined : truncateCellWidth(detail, 80)
}

export function truncateCellWidth(value: string, maxColumns: number): string {
  const clean = sanitizeSingleLine(value)
  const limit = Math.max(0, Math.trunc(maxColumns))
  if (limit === 0) return ''
  if (stringWidth(clean) <= limit) return clean
  if (limit === 1) return '…'
  let output = ''
  for (const segment of graphemes(clean)) {
    if (stringWidth(output + segment) > limit - 1) break
    output += segment
  }
  return `${output}…`
}

function selectPrimaryDetail(node: ToolNode): string | undefined {
  const normalizedName = node.name.trim().toLowerCase()
  if (normalizedName === 'exit_plan_mode' || normalizedName === 'ask_user_question') {
    return undefined
  }
  const error = toolErrorSummary(node.error)
  if (error !== undefined) return error
  const firstResultLine = node.result?.replace(/\r\n?/g, '\n').split('\n', 1)[0]
  if (node.status === 'error') {
    const resultError = cleanDetail(firstResultLine)
    if (resultError !== undefined) return resultError
  }
  const view = cleanDetail(toolViewPrimaryDetail(node.view))
  if (view !== undefined) return view
  const args = toolArgumentSummary(node.args, Number.MAX_SAFE_INTEGER)
  if (args !== undefined) return args
  return cleanDetail(firstResultLine)
}

function cleanDetail(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  const clean = sanitizeSingleLine(value)
  return clean === '' ? undefined : clean
}

function redactSensitiveArguments(args: string): string {
  const trimmed = args.trim()
  if (trimmed === '') return ''
  try {
    return JSON.stringify(redactValue(JSON.parse(trimmed) as unknown))
  } catch {
    return args.replace(
      /(\"?(?:api[-_]?key|token|password|secret|authorization|cookie)\"?\s*[:=]\s*)(\"[^\"]*\"|[^,}\s]+)/gi,
      '$1"[redacted]"',
    )
  }
}

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactValue)
  if (typeof value !== 'object' || value === null) return value
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      /api[-_]?key|token|password|secret|authorization|cookie/i.test(key)
        ? '[redacted]'
        : redactValue(item),
    ]),
  )
}

function graphemes(value: string): readonly string[] {
  return Array.from(
    new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value),
    ({ segment }) => segment,
  )
}
