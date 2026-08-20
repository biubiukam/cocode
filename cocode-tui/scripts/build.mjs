import { mkdir, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = fileURLToPath(new URL('..', import.meta.url))
const dist = resolve(root, 'dist')
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
await mkdir(dist, { recursive: true })

const tuiBuild = await build({
  absWorkingDir: root,
  entryPoints: ['src/main.tsx'],
  outfile: resolve(dist, 'cocode-tui.mjs'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22.19',
  alias: {
    'react-devtools-core': resolve(root, 'scripts/react-devtools-core-stub.mjs'),
  },
  define: { 'process.env.DEV': '"false"', 'process.env["DEV"]': '"false"', __COCODE_TUI_VERSION__: JSON.stringify(packageJson.version) },
  // The bundle is emitted as ESM, but Ink's dependency tree still contains
  // CommonJS packages that use a runtime `require()` for Node built-ins (for
  // example signal-exit -> assert/events).  Give esbuild's dynamic-require
  // helper a real ESM-compatible require so the packaged CLI can start under
  // the bundled Node runtime.
  banner: {
    js: 'import { createRequire as __cocodeCreateRequire } from "node:module"; const require = __cocodeCreateRequire(import.meta.url);',
  },
  sourcemap: true,
  tsconfig: resolve(root, 'tsconfig.json'),
  metafile: true,
})
await writeFile(
  resolve(dist, 'cocode-tui.meta.json'),
  JSON.stringify(tuiBuild.metafile, null, 2),
)

console.log(`Built Cocode TUI into ${dist}`)
