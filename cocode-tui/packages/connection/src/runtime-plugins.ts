import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Version the TUI Host scope with the staged runtime plugins.
 *
 * The Supervisor reuses an existing Host when its scope is unchanged. A
 * plugin build can change the LLM stream seam without changing the provider
 * environment, so omitting the plugin bundle from the scope leaves TUI on a
 * stale Host that may not have `cocode-dsml` loaded.
 */
export function runtimePluginFingerprint(): string {
  try {
    const packagePath = findDependencyPackage('host-supervisor')
    return fingerprintRuntimePlugins(join(dirname(packagePath), 'runtime'))
  } catch {
    // Keep the scope deterministic even when an incomplete installation is
    // being diagnosed. The normal startup path still reports the missing Host
    // dependency through its existing error handling.
    return 'unavailable'
  }
}

export function fingerprintRuntimePlugins(runtimeRoot: string): string {
  const manifestPath = join(runtimeRoot, 'plugins.json')
  const manifest = readFileSync(manifestPath)
  const parsed = JSON.parse(manifest.toString('utf8')) as { plugins?: unknown }
  const names = Array.isArray(parsed.plugins)
    ? parsed.plugins.filter((value): value is string => typeof value === 'string').sort()
    : []
  const hash = createHash('sha256')
  hash.update(manifest)
  for (const name of names) {
    for (const relative of [`${name}/package.json`, `${name}/lib/index.js`]) {
      const file = join(runtimeRoot, 'plugins', relative)
      if (!existsSync(file)) continue
      hash.update(relative)
      hash.update(readFileSync(file))
    }
  }
  return hash.digest('hex').slice(0, 32)
}

function findDependencyPackage(name: string): string {
  let directory = dirname(fileURLToPath(import.meta.url))
  while (directory !== dirname(directory)) {
    const candidate = join(directory, 'node_modules', '@cocode', name, 'package.json')
    if (existsSync(candidate)) return candidate
    directory = dirname(directory)
  }
  throw new Error(`@cocode/${name} package manifest is unavailable`)
}
