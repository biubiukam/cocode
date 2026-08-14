/**
 * Enforces the four-layer one-way dependency direction (RFC §4.1).
 * The rules are machine-checked rather than agreed upon, because the zero-React
 * runtime line is the one most likely to be crossed under time pressure.
 */

import { readdir, readFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

/**
 * Each rule owns one scope. `forbidPackages` matches bare specifiers; `contain`
 * requires every relative import to stay inside the scope, which is how a layer
 * is stopped from reaching sideways or upwards.
 */
const RULES = [
  {
    scope: 'src/runtime',
    forbidPackages: /^(react|react-dom|@cocode\/ui|lucide-react|electron|zustand\/react)(\/|$)/,
    contain: true,
    why: 'the runtime layer is React-free and never knows the layers above it',
  },
  {
    scope: 'src/shell',
    forbidPackages: /^electron(\/|$)/,
    why: 'the presentation layer reaches native capabilities through HostBridge',
  },
  {
    scope: 'src/panels',
    forbidPackages: /^electron(\/|$)/,
    why: 'the presentation layer reaches native capabilities through HostBridge',
  },
  {
    scope: 'src/conversation',
    forbidPackages: /^electron(\/|$)/,
    why: 'the presentation layer reaches native capabilities through HostBridge',
  },
  {
    scope: 'packages/connection/src',
    forbidPackages: /^(react|react-dom|@cocode\/ui|electron)(\/|$)/,
    contain: true,
    why: 'the transport layer is React-free and depends on nothing in the app',
  },
]

const IMPORT_PATTERN = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g

/** Yields every TypeScript source file below `dir`. */
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
    else if (/\.tsx?$/.test(entry.name)) yield path
  }
}

const violations = []

for (const rule of RULES) {
  const scopeRoot = join(ROOT, rule.scope)
  for await (const file of walk(scopeRoot)) {
    const source = await readFile(file, 'utf8')
    for (const match of source.matchAll(IMPORT_PATTERN)) {
      const specifier = match[1] ?? match[2]
      if (specifier === undefined) continue
      const isRelative = specifier.startsWith('.')

      if (!isRelative && rule.forbidPackages.test(specifier)) {
        violations.push(`${relative(ROOT, file)} imports "${specifier}" — ${rule.why}`)
        continue
      }
      if (isRelative && rule.contain === true) {
        const resolved = resolve(dirname(file), specifier)
        if (!resolved.startsWith(scopeRoot)) {
          violations.push(`${relative(ROOT, file)} imports "${specifier}" outside ${rule.scope} — ${rule.why}`)
        }
      }
    }
  }
}

const pluginsRoot = join(ROOT, 'src/plugins')
for await (const file of walk(pluginsRoot)) {
  const rel = relative(pluginsRoot, file)
  const pluginId = rel.split(/[\\/]/)[0]
  const inUi = /(?:^|[\\/])ui[\\/]/.test(rel)
  const source = await readFile(file, 'utf8')
  for (const match of source.matchAll(IMPORT_PATTERN)) {
    const specifier = match[1] ?? match[2]
    if (specifier === undefined) continue
    if (inUi && specifier.startsWith('@deepseek-ai/cordis')) {
      violations.push(`${relative(ROOT, file)} imports "${specifier}" — plugin ui must not see Context`)
    }
    if (!specifier.startsWith('.')) continue
    const resolved = resolve(dirname(file), specifier)
    const other = relative(pluginsRoot, resolved)
    if (other.startsWith('..')) continue
    const otherId = other.split(/[\\/]/)[0]
    if (otherId !== pluginId) {
      violations.push(`${relative(ROOT, file)} imports sibling plugin "${otherId}" — plugins must not import each other`)
    }
  }
}

if (violations.length > 0) {
  console.error('layer direction violations:')
  for (const violation of violations) console.error(`  ${violation}`)
  process.exit(1)
}

console.log('check:layers ok')
