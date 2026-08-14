/**
 * Enforces "components consume semantic aliases, never literal colors" (RFC §4.4 / §7.1).
 * Tailwind's stock palette and arbitrary color values both bypass the token file,
 * so both are rejected outside `packages/ui/src/tokens.css` — the single definition site.
 */

import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SCOPES = ['src', 'packages/ui/src', 'packages/connection/src']
const TOKEN_FILE = join(ROOT, 'packages/ui/src/tokens.css')

const PALETTE = [
  'slate', 'gray', 'zinc', 'neutral', 'stone', 'red', 'orange', 'amber', 'yellow', 'lime',
  'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia',
  'pink', 'rose',
].join('|')

/**
 * Any notation that names a color directly instead of deriving it from a token.
 * `color-mix()` is deliberately absent: the design system §1.2 defines its border
 * recipes as mixes, and a mix over `var(--token)` still has exactly one source of
 * truth. The mix is only rejected when a literal appears inside it.
 */
const LITERAL_COLOR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(/

const CHECKS = [
  {
    pattern: new RegExp(`\\b(?:bg|text|border|ring|fill|stroke|from|via|to|outline|shadow|decoration|accent|caret|divide|placeholder)-(?:${PALETTE})-\\d{2,3}\\b`, 'g'),
    why: 'Tailwind palette color class (use a semantic alias from tokens.css)',
  },
  {
    pattern: /\b(?:bg|text|border|ring|fill|stroke|outline|shadow|decoration|accent|caret|divide|placeholder)-\[[^\]]*\]/g,
    reject: LITERAL_COLOR,
    why: 'literal color inside an arbitrary value (derive it from a token)',
  },
  {
    pattern: /(?<![-\w])#[0-9a-fA-F]{3,8}\b(?![\w])/g,
    why: 'literal hex color',
    files: /\.(css|tsx?)$/,
  },
]

/** Yields every checkable source file below `dir`. */
async function* walk(dir) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  }
  catch {
    return
  }
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(path)
    else if (/\.(tsx?|css)$/.test(entry.name)) yield path
  }
}

const violations = []

for (const scope of SCOPES) {
  for await (const file of walk(join(ROOT, scope))) {
    if (file === TOKEN_FILE) continue
    const source = await readFile(file, 'utf8')
    const lines = source.split('\n')
    for (const check of CHECKS) {
      if (check.files && !check.files.test(file)) continue
      lines.forEach((line, index) => {
        if (line.includes('design-token-exempt')) return
        for (const match of line.matchAll(check.pattern)) {
          if (check.reject !== undefined && !check.reject.test(match[0])) continue
          violations.push(`${relative(ROOT, file)}:${index + 1} "${match[0]}" — ${check.why}`)
        }
      })
    }
  }
}

if (violations.length > 0) {
  console.error('design token violations:')
  for (const violation of violations) console.error(`  ${violation}`)
  process.exit(1)
}

console.log('check:design ok')
