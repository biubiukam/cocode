import { createRequire } from 'node:module'
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runtimeSlotDirectory } from './paths.js'
import { hostKey, type HostScope } from './protocol.js'

export type RuntimeSlot = { root: string; entry: string; version: string; buildId?: string; patch: string; jsonRpcEndpoint: string }

export type RuntimePluginEntry = { name: string; entry: string }

type RuntimePackageManifest = {
  name?: string
  version?: string
  dependencies?: Record<string, string>
}

export function resolveDshPackage(): { root: string; entry: string; version: string; buildId?: string } {
  const require = createRequire(import.meta.url)
  const entry = require.resolve('@deepseek-ai/dsh/lib/bin.js')
  let root = dirname(entry)
  while (root !== dirname(root) && !existsSync(join(root, 'package.json'))) root = dirname(root)
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const buildId = typeof manifest.buildId === 'string'
    ? manifest.buildId
    : typeof manifest.gitHead === 'string'
      ? manifest.gitHead
      : process.env.COCODE_DSH_BUILD_ID?.trim() || undefined
  return { root, entry, version: String(manifest.version), ...(buildId === undefined ? {} : { buildId }) }
}

export function prepareRuntimeSlot(scope: HostScope, jsonRpcEndpoint: string, pluginPath: string): RuntimeSlot {
  const dsh = resolveDshPackage()
  const slot = runtimeSlotDirectory(scope, dsh.version)
  const entry = join(slot, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
  const pluginRoot = resolve(dirname(pluginPath), '../../../runtime/plugins')
  const pluginSources = existsSync(pluginRoot)
    ? readdirSync(pluginRoot, { withFileTypes: true })
      .filter((item) => item.isDirectory())
      .map((item) => join(pluginRoot, item.name))
    : []
  if (!existsSync(entry)) {
    rmSync(slot, { recursive: true, force: true })
    mkdirSync(join(slot, 'node_modules', '@deepseek-ai'), { recursive: true })
    copyPackageClosure(dsh.root, slot, pluginSources)
    mkdirSync(slot, { recursive: true })
    writeFileSync(join(slot, 'package.json'), JSON.stringify({ type: 'module', private: true }) + '\n')
  }
  const pluginTarget = join(slot, 'cocode-host-jsonrpc-plugin.mjs')
  cpSync(pluginPath, pluginTarget)
  const pluginEntries: RuntimePluginEntry[] = []
  if (existsSync(pluginRoot)) {
    for (const entry of readdirSync(pluginRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const source = join(pluginRoot, entry.name)
      const target = join(slot, 'node_modules', ...entry.name.split('/'))
      mkdirSync(dirname(target), { recursive: true })
      cpSync(source, target, { recursive: true, dereference: true })
      pluginEntries.push({ name: entry.name, entry: join(target, 'lib', 'index.js') })
    }
  }
  registerRuntimePluginsInDshManifest(slot, pluginEntries)
  restoreNodePtyHelper(slot)
  const patch = join(slot, 'cocode-host.patch.yml')
  const rows = createRuntimePatch(pathToFileURL(pluginTarget).href, jsonRpcEndpoint, pluginEntries)
  writeFileSync(patch, rows)
  writeFileSync(join(slot, 'active.json'), `${JSON.stringify({
    schemaVersion: 1,
    hostKey: hostKey(scope),
    runtimeVersion: dsh.version,
    ...(dsh.buildId === undefined ? {} : { buildId: dsh.buildId }),
    runtimeChannel: scope.runtimeChannel,
    hostConfigFingerprint: scope.hostConfigFingerprint,
    jsonRpcEndpoint,
    plugins: pluginEntries,
  }, null, 2)}\n`)
  return { root: slot, entry, version: dsh.version, ...(dsh.buildId === undefined ? {} : { buildId: dsh.buildId }), patch, jsonRpcEndpoint }
}

/**
 * Make out-of-tree Cocode plugins part of DSH's installation dependency
 * closure. DSH uses that closure to populate DSH_HOME/profiles/node_modules;
 * without these declarations, bare plugin names in the patch are resolved
 * relative to the profile and cannot see the immutable runtime slot.
 */
function registerRuntimePluginsInDshManifest(slot: string, pluginEntries: readonly RuntimePluginEntry[]): void {
  const manifestPath = join(slot, 'node_modules', '@deepseek-ai', 'dsh', 'package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as RuntimePackageManifest
  const pluginManifests = pluginEntries.map(({ name }) => {
    const pluginManifestPath = join(slot, 'node_modules', ...name.split('/'), 'package.json')
    return JSON.parse(readFileSync(pluginManifestPath, 'utf8')) as RuntimePackageManifest
  })
  const next = addRuntimePluginDependencies(manifest, pluginManifests)
  writeFileSync(manifestPath, `${JSON.stringify(next, null, 2)}\n`)
}

export function addRuntimePluginDependencies(
  manifest: RuntimePackageManifest,
  pluginManifests: readonly RuntimePackageManifest[],
): RuntimePackageManifest {
  const dependencies = { ...(manifest.dependencies ?? {}) }
  for (const plugin of pluginManifests) {
    if (typeof plugin.name !== 'string' || plugin.name.length === 0) continue
    dependencies[plugin.name] = typeof plugin.version === 'string' && plugin.version.length > 0
      ? plugin.version
      : '*'
  }
  return { ...manifest, dependencies }
}

/**
 * Render the DSH overlay patch. Cocode plugins must be registered by their
 * package name so DSH can resolve each package manifest and its `dsh.client`
 * declaration while constructing the Web boot manifest.
 */
export function createRuntimePatch(
  jsonRpcPluginUrl: string,
  jsonRpcEndpoint: string,
  pluginEntries: readonly RuntimePluginEntry[],
): string {
  return [
    '- insert:',
    '    - id: cocode-host-jsonrpc',
    `      name: ${JSON.stringify(jsonRpcPluginUrl)}`,
    '      config:',
    `        endpoint: ${JSON.stringify(jsonRpcEndpoint)}`,
    `        protocolRevision: "1.0"`,
    ...pluginEntries.flatMap(({ name }) => [
      `    - id: ${name}`,
      `      name: ${JSON.stringify(name)}`,
    ]),
    '',
  ].join('\n')
}

function restoreNodePtyHelper(root: string): void {
  for (const helper of [
    join(root, 'node_modules', 'node-pty', 'prebuilds', `${process.platform}-${process.arch}`, 'spawn-helper'),
    join(root, 'node_modules', 'node-pty', 'build', 'Release', 'spawn-helper'),
  ]) {
    if (existsSync(helper)) chmodSync(helper, 0o755)
  }
}

function copyPackageClosure(dshRoot: string, slot: string, additionalRoots: readonly string[] = []): void {
  /**
   * pnpm's isolated install is not a portable runtime tree: package links in
   * `node_modules` point back into `.pnpm`, and copying that directory leaves
   * a slot whose dependency resolution still depends on the source checkout.
   * Build a flat, self-contained closure instead. Each package is resolved
   * from the installed DSH package, copied without its package-local
   * `node_modules`, and then made available from slot/node_modules. This is
   * the same lookup shape an npm install provides and is also the shape used
   * by DSH's profile fallback healer.
   */
  const targetModules = join(slot, 'node_modules')
  const pending = [realpathSync(dshRoot), ...additionalRoots.map((root) => realpathSync(root))]
  const copied = new Set<string>()
  const resolved = new Map<string, string>()
  while (pending.length > 0) {
    const sourceRoot = pending.shift()!
    const manifestPath = join(sourceRoot, 'package.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      name?: string
      dependencies?: Record<string, string>
      optionalDependencies?: Record<string, string>
      peerDependencies?: Record<string, string>
      peerDependenciesMeta?: Record<string, { optional?: boolean }>
    }
    if (typeof manifest.name !== 'string' || copied.has(manifest.name)) continue
    copied.add(manifest.name)
    resolved.set(manifest.name, sourceRoot)

    const destination = join(targetModules, ...manifest.name.split('/'))
    mkdirSync(dirname(destination), { recursive: true })
    cpSync(sourceRoot, destination, {
      recursive: true,
      dereference: true,
      filter: (source) => basename(source) !== 'node_modules',
    })

    const dependencies = {
      ...manifest.dependencies,
      ...manifest.optionalDependencies,
      ...manifest.peerDependencies,
    }
    const packageRequire = createRequire(manifestPath)
    for (const dependency of Object.keys(dependencies)) {
      if (resolved.has(dependency)) continue
      try {
        const dependencyRoot = resolvePackageRoot(packageRequire, dependency)
        pending.push(dependencyRoot)
      } catch (error) {
        if (manifest.optionalDependencies?.[dependency] !== undefined || manifest.peerDependenciesMeta?.[dependency]?.optional === true) continue
        throw new Error(`Unable to resolve DSH runtime dependency ${dependency} from ${sourceRoot}: ${String(error)}`)
      }
    }
  }
}

function resolvePackageRoot(require: NodeRequire, packageName: string): string {
  // Do not use `require.resolve(`${name}/package.json`)`: many valid npm
  // packages intentionally do not export their manifest. Node still exposes
  // the package lookup roots, which lets us locate the package directory in
  // both npm's flat tree and pnpm's `.pnpm/node_modules` fallback.
  for (const searchPath of require.resolve.paths(packageName) ?? []) {
    const candidate = join(searchPath, ...packageName.split('/'))
    const manifestPath = join(candidate, 'package.json')
    if (!existsSync(manifestPath)) continue
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { name?: string }
    if (manifest.name === packageName) return realpathSync(candidate)
  }
  throw new Error(`package root not found for ${packageName}`)
}
