import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = fileURLToPath(new URL('..', import.meta.url))
const dist = resolve(root, 'dist')
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
  define: { 'process.env.DEV': '"false"', 'process.env["DEV"]': '"false"' },
  sourcemap: true,
  tsconfig: resolve(root, 'tsconfig.json'),
  metafile: true,
})
await writeFile(
  resolve(dist, 'cocode-tui.meta.json'),
  JSON.stringify(tuiBuild.metafile, null, 2),
)

await build({
  absWorkingDir: root,
  entryPoints: ['packages/companion/src/index.ts'],
  outfile: resolve(dist, 'companion.mjs'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22.19',
  sourcemap: true,
  tsconfig: resolve(root, 'tsconfig.json'),
})

await build({
  absWorkingDir: root,
  entryPoints: ['packages/vision/src/index.ts'],
  outfile: resolve(dist, 'vision.mjs'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22.19',
  sourcemap: true,
  tsconfig: resolve(root, 'tsconfig.json'),
})

await copyFile(resolve(root, 'scripts/companion-runner.mjs'), resolve(dist, 'companion-runner.mjs'))
await copyFile(resolve(root, 'scripts/companion-layout.mjs'), resolve(dist, 'companion-layout.mjs'))

const sourceConfig = await readFile(resolve(root, 'companion/cordis.yml'), 'utf8')
const packagedConfig = sourceConfig.replace(
  "name: '../packages/companion/src/index.ts'",
  "name: './companion.mjs'",
).replace("name: '../packages/vision/src/index.ts'", "name: './vision.mjs'")
await writeFile(resolve(dist, 'companion.cordis.yml'), packagedConfig)

console.log(`Built Cocode TUI into ${dist}`)
