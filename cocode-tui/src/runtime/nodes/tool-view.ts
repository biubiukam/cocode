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
