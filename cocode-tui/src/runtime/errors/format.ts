/**
 * Format catalog codes as "CODE · explanation".
 */

import { redactSecrets } from '../diagnostics.ts'
import { ERROR_CATALOG, type ErrorCode, type ErrorParams, type Locale } from './catalog.ts'
import { resolveLocale } from './locale.ts'

export function formatError(
  code: ErrorCode,
  params: ErrorParams = {},
  locale: Locale = resolveLocale(),
): string {
  const entry = ERROR_CATALOG[code]
  const template = entry[locale] || entry.en
  return `${code} · ${interpolate(template, params)}`
}

export class TuiError extends Error {
  readonly code: ErrorCode
  readonly params: ErrorParams

  constructor(code: ErrorCode, params: ErrorParams = {}) {
    super(formatError(code, params))
    this.name = 'TuiError'
    this.code = code
    this.params = params
  }
}

export function displayError(error: unknown, locale: Locale = resolveLocale()): string {
  if (error instanceof TuiError) return formatError(error.code, error.params, locale)
  const code = errorCodeOf(error)
  if (code !== undefined) return formatError(code, {}, locale)
  const raw = error instanceof Error ? error.message : String(error)
  if (isErrorCode(raw)) return formatError(raw, {}, locale)
  return formatError('RUNTIME_UNKNOWN', { detail: redactSecrets(raw) }, locale)
}

export function errorNotice(
  code: ErrorCode,
  params: ErrorParams = {},
): { tone: 'error'; message: string } {
  return { tone: 'error', message: formatError(code, params) }
}

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && Object.hasOwn(ERROR_CATALOG, value)
}

function errorCodeOf(error: unknown): ErrorCode | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const code = (error as { code?: unknown }).code
  return isErrorCode(code) ? code : undefined
}

function interpolate(template: string, params: ErrorParams): string {
  const filled = template.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const value = params[key]
    if (value === undefined || String(value) === '') return ''
    return String(value)
  })
  return filled
    .replace(/: *\./g, '.')
    .replace(/： *。/g, '。')
    .replace(/: *$/g, '.')
    .replace(/： *$/g, '。')
    .replace(/ +\./g, '.')
    .replace(/ +。/g, '。')
    .replace(/ {2,}/g, ' ')
    .trim()
}
