/** Infer a small terminal-safe view from the existing tool call payload. */

import type { ToolView } from './types.ts'

export function inferToolView(name: string, args: string): ToolView | undefined {
  const normalized = name.trim().toLowerCase()
  const input = parseArgs(args)
  if (/(^|[._:/-])(read|cat|file)([._:/-]|$)/.test(normalized)) {
    return { kind: 'read', path: stringValue(input, ['path', 'file', 'filename']) }
  }
  if (/(search|grep|rg|ripgrep|find)/.test(normalized)) {
    return { kind: 'search', query: stringValue(input, ['query', 'pattern', 'q']) }
  }
  if (/(diff|patch)/.test(normalized)) {
    return { kind: 'diff', paths: pathValues(input) }
  }
  if (/(terminal|shell|bash|zsh|exec|command)/.test(normalized)) {
    return { kind: 'terminal', command: stringValue(input, ['command', 'cmd', 'script']) }
  }
  return undefined
}

export function toolViewDetail(view: ToolView | undefined): string | undefined {
  if (view === undefined) return undefined
  if (view.kind === 'read') return view.path === undefined ? 'read' : `read ${view.path}`
  if (view.kind === 'search') return view.query === undefined ? 'search' : `search ${view.query}`
  if (view.kind === 'diff') {
    return view.paths === undefined || view.paths.length === 0
      ? 'diff'
      : `diff ${view.paths.join(', ')}`
  }
  return view.command === undefined ? 'terminal' : `terminal ${view.command}`
}

/** Select the most useful single-line object/result detail for a tool summary. */
export function toolViewPrimaryDetail(view: ToolView | undefined): string | undefined {
  if (view === undefined) return undefined
  if (view.kind === 'read') return view.path
  if (view.kind === 'search') return view.query
  if (view.kind === 'terminal') return view.command
  if (view.summary !== undefined && view.summary.files.length > 0) {
    const fileLabel =
      view.summary.files.length === 1
        ? view.summary.files[0]?.path ?? '1 file'
        : `${view.summary.files.length} files`
    return `${fileLabel} · +${view.summary.additions}/-${view.summary.deletions}`
  }
  return view.paths?.join(', ')
}

export const PLAN_PROGRESS_MAX_CHARS = 1600

/** Extract a complete or still-growing JSON string argument from a tool call. */
export function extractPartialJsonStringArgument(
  args: string,
  key: string,
): string | undefined {
  const marker = new RegExp(`(?:^|[,{])\\s*\\"${escapeRegExp(key)}\\"\\s*:\\s*\\"`).exec(args)
  if (marker === null) return undefined
  const start = marker.index + marker[0].length
  let raw = ''
  let escaped = false
  for (let index = start; index < args.length; index += 1) {
    const character = args[index]
    if (escaped) {
      raw += character
      escaped = false
      continue
    }
    if (character === '\\') {
      raw += character
      escaped = true
      continue
    }
    if (character === '"') return decodeJsonString(raw)
    raw += character
  }
  return decodeJsonString(raw, true)
}

export function truncatePlanProgress(value: string): string {
  if (value.length <= PLAN_PROGRESS_MAX_CHARS) return value
  return `${value.slice(0, PLAN_PROGRESS_MAX_CHARS)}\n…`
}

function parseArgs(args: string): Record<string, unknown> {
  if (args.trim() === '') return {}
  try {
    const value: unknown = JSON.parse(args)
    return isRecord(value) ? value : {}
  } catch {
    return {}
  }
}

function stringValue(input: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    if (typeof input[key] === 'string' && input[key].trim() !== '') return input[key].trim()
  }
  return undefined
}

function pathValues(input: Record<string, unknown>): string[] | undefined {
  const value = input.paths
  if (!Array.isArray(value)) {
    const path = stringValue(input, ['path', 'file', 'filename'])
    return path === undefined ? undefined : [path]
  }
  const paths = value.filter((item): item is string => typeof item === 'string' && item !== '')
  return paths.length === 0 ? undefined : paths
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function decodeJsonString(raw: string, partial = false): string | undefined {
  for (let end = raw.length; end >= 0; end -= 1) {
    try {
      return JSON.parse(`"${raw.slice(0, end)}"`) as string
    } catch {
      if (!partial) return undefined
    }
  }
  return undefined
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
