/**
 * Bundles the Electron desktop layer. The main process ships as ESM (the root
 * package is `type: module`); the preload MUST stay CommonJS because a sandboxed
 * preload has no ESM loader.
 */

import { build } from 'esbuild'

const shared = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  sourcemap: true,
  external: ['electron'],
  logLevel: 'info',
}

await build({
  ...shared,
  entryPoints: ['electron/main.ts'],
  format: 'esm',
  outfile: 'dist-electron/main.js',
})

await build({
  ...shared,
  entryPoints: ['electron/preload.ts'],
  format: 'cjs',
  outfile: 'dist-electron/preload.cjs',
})
