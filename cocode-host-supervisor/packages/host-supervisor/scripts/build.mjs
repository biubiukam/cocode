import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const workspaceRoot = resolve(packageRoot, '../..')
const lib = join(packageRoot, 'lib')
rmSync(lib, { recursive: true, force: true })
mkdirSync(lib, { recursive: true })

execFileSync(process.execPath, [resolve(workspaceRoot, 'node_modules/typescript/bin/tsc'), '-p', join(packageRoot, 'tsconfig.build.json')], { cwd: workspaceRoot, stdio: 'inherit' })

await build({
  absWorkingDir: workspaceRoot,
  entryPoints: [join(packageRoot, 'src/index.ts')],
  outfile: join(lib, 'index.js'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  sourcemap: true,
  tsconfig: join(packageRoot, 'tsconfig.json'),
})

await build({
  absWorkingDir: workspaceRoot,
  entryPoints: [join(packageRoot, 'src/bin.ts')],
  outfile: join(lib, 'bin.js'),
  bundle: true,
  // Keep Pino as a normal runtime dependency. Its package intentionally uses
  // Node's dynamic require path for platform helpers; bundling it into an ESM
  // file makes esbuild emit a runtime-incompatible `__require` shim. The
  // staging step materializes the Supervisor dependency closure, so the
  // external import remains self-contained in packaged Desktop builds.
  external: ['pino'],
  format: 'esm',
  platform: 'node',
  target: 'node22',
  sourcemap: true,
  tsconfig: join(packageRoot, 'tsconfig.json'),
})

await build({
  absWorkingDir: workspaceRoot,
  entryPoints: [join(packageRoot, 'src/host-jsonrpc-plugin/index.ts')],
  outfile: join(lib, 'host-jsonrpc-plugin.js'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  sourcemap: true,
  tsconfig: join(packageRoot, 'tsconfig.json'),
})

const runtimeRoot = join(packageRoot, '..', '..', 'runtime')
mkdirSync(runtimeRoot, { recursive: true })
const pluginSourceRoot = resolve(packageRoot, '../../../cocode-gui/packages/cocode')
const plugins = []
if (existsSync(pluginSourceRoot)) {
  for (const entry of readdirSync(pluginSourceRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const source = join(pluginSourceRoot, entry.name)
    const manifestPath = join(source, 'package.json')
    if (!existsSync(manifestPath)) continue
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    if (!manifest.name || manifest.private !== true || !manifest.cocode) continue
    const target = join(runtimeRoot, 'plugins', manifest.name)
    rmSync(target, { recursive: true, force: true })
    mkdirSync(target, { recursive: true })
    for (const item of ['lib', 'cordis.patch.yml', 'LICENSE', 'README.md', 'README_EN.md']) {
      const from = join(source, item)
      if (existsSync(from)) cpSync(from, join(target, item), { recursive: true, dereference: true })
    }
    writeFileSync(join(target, 'package.json'), JSON.stringify({
      name: manifest.name,
      version: manifest.version,
      type: manifest.type ?? 'module',
      main: manifest.main ?? 'lib/index.js',
      exports: manifest.exports,
      dsh: manifest.dsh,
      dependencies: Object.fromEntries((manifest.cocode.runtimeDependencies ?? []).map((name) => [name, manifest.dependencies?.[name] ?? '*'])),
    }, null, 2) + '\n')
    plugins.push(manifest.name)
  }
}
writeFileSync(join(runtimeRoot, 'plugins.json'), JSON.stringify({ plugins }, null, 2) + '\n')

const bin = join(packageRoot, 'bin')
mkdirSync(bin, { recursive: true })
writeFileSync(join(bin, 'cocode-host-supervisor.mjs'), '#!/usr/bin/env node\nimport "../lib/bin.js"\n')
console.log(`Built @cocode/host-supervisor with ${plugins.length} bundled Cocode plugins`)
