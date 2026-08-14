/**
 * Shiki access for every code surface (RFC §4.4).
 *
 * One lazily-created highlighter serves Preview, diffs, and tool cards, so the
 * grammar set is loaded once and the two themes track the shell's own light and
 * dark modes. Shiki is imported dynamically: the shell must paint before a
 * grammar bundle finishes downloading.
 */

import type { Highlighter } from 'shiki'

const LANGUAGES = [
  'bash', 'c', 'cpp', 'css', 'diff', 'dockerfile', 'go', 'html', 'ini', 'java',
  'javascript', 'json', 'jsonc', 'kotlin', 'lua', 'make', 'markdown', 'php',
  'python', 'ruby', 'rust', 'shell', 'sql', 'swift', 'toml', 'tsx', 'typescript',
  'xml', 'yaml',
] as const

const THEMES = { light: 'github-light', dark: 'github-dark' } as const

let pending: Promise<Highlighter> | undefined

/** Resolves the shared highlighter, creating it on first use. */
export async function getHighlighter(): Promise<Highlighter> {
  pending ??= import('shiki').then(shiki => shiki.createHighlighter({
    themes: [THEMES.light, THEMES.dark],
    langs: [...LANGUAGES],
  }))
  return pending
}

/** Maps a file path to a loaded grammar; unknown extensions fall back to plain text. */
export function languageOf(path: string): string {
  const extension = path.split('.').pop()?.toLowerCase() ?? ''
  const byExtension: Record<string, string> = {
    ts: 'typescript', tsx: 'tsx', mts: 'typescript', cts: 'typescript',
    js: 'javascript', jsx: 'tsx', mjs: 'javascript', cjs: 'javascript',
    json: 'json', jsonc: 'jsonc', md: 'markdown', mdx: 'markdown',
    css: 'css', html: 'html', xml: 'xml', svg: 'xml',
    yml: 'yaml', yaml: 'yaml', toml: 'toml', ini: 'ini',
    sh: 'bash', bash: 'bash', zsh: 'bash', fish: 'shell',
    py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java', kt: 'kotlin',
    c: 'c', h: 'c', cc: 'cpp', cpp: 'cpp', hpp: 'cpp', php: 'php', swift: 'swift',
    sql: 'sql', lua: 'lua',
  }
  const named: Record<string, string> = { dockerfile: 'dockerfile', makefile: 'make' }
  const base = path.split('/').pop()?.toLowerCase() ?? ''
  return byExtension[extension] ?? named[base] ?? 'text'
}

export const HIGHLIGHT_THEMES = THEMES
