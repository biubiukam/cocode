import { mkdir, writeFile } from 'node:fs/promises'
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

console.log(`Built Cocode TUI into ${dist}`)
