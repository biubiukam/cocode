/**
 * Locale from COCODE_LANG, environment locale, then the runtime locale.
 */

import type { Locale } from './catalog.ts'

export function resolveLocale(
  env: NodeJS.ProcessEnv = process.env,
  systemLocale: string | undefined = Intl.DateTimeFormat().resolvedOptions().locale,
): Locale {
  const configured = firstTag(env.COCODE_LANG)
  if (configured !== undefined) return configured === 'zh' ? 'zh' : 'en'
  const fallback =
    firstTag(env.LC_ALL) ??
    firstTag(env.LC_MESSAGES) ??
    firstTag(env.LANG) ??
    firstTag(systemLocale)
  return fallback === 'zh' ? 'zh' : 'en'
}

function firstTag(value: string | undefined): 'zh' | 'en' | undefined {
  const trimmed = value?.trim()
  if (trimmed === undefined || trimmed === '') return undefined
  const language = trimmed.split(/[._-]/)[0]?.toLowerCase()
  if (language === 'zh') return 'zh'
  if (language === 'en') return 'en'
  return 'en'
}
