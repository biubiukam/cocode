#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packageJson = JSON.parse(
  readFileSync(resolve(packageRoot, 'package.json'), 'utf8'),
)

const args = process.argv.slice(2)
if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write(`Cocode TUI ${packageJson.version}\n\n`)
  process.stdout.write('Usage: cocode [options]\n\n')
  process.stdout.write('Options:\n')
  process.stdout.write('  --help, -h       Show this help\n')
  process.stdout.write('  --version, -v    Show the installed version\n')
  process.stdout.write('  --doctor         Check the local Harness runtime and configuration\n')
  process.exit(0)
}

if (args.includes('--version') || args.includes('-v')) {
  process.stdout.write(`${packageJson.version}\n`)
  process.exit(0)
}

if (args.includes('--doctor')) {
  const harnessRoot = process.env.COCODE_HARNESS_ROOT?.trim()
  const runner = resolve(packageRoot, 'dist', 'companion-runner.mjs')
  const harnessReady =
    harnessRoot !== undefined &&
    harnessRoot !== '' &&
    (existsSync(resolve(harnessRoot, 'packages/examples/jsonrpc-demo/lib/runner.js')) ||
      existsSync(resolve(harnessRoot, 'packages/examples/jsonrpc-demo/src/runner.ts'))) &&
    existsSync(resolve(harnessRoot, 'examples/package.json'))
  const checks = [
    ['package', true],
    ['built TUI', existsSync(resolve(packageRoot, 'dist', 'cocode-tui.mjs'))],
    ['companion runner', existsSync(runner)],
    ['COCODE_HARNESS_ROOT', harnessRoot !== undefined && harnessRoot !== ''],
    ['Harness runtime', harnessReady],
  ]
  for (const [label, ok] of checks) process.stdout.write(`${ok ? 'ok' : 'missing'} ${label}\n`)
  process.exit(checks.every(([, ok]) => ok) ? 0 : 1)
}

const entry = resolve(packageRoot, 'dist', 'cocode-tui.mjs')
if (!existsSync(entry)) {
  process.stderr.write('Cocode TUI is missing its build output. Run `pnpm run build` first.\n')
  process.exit(1)
}

const env = { ...process.env }
if (env.COCODE_HARNESS_CMD?.trim() === undefined || env.COCODE_HARNESS_CMD.trim() === '') {
  env.COCODE_HARNESS_CMD = process.execPath
}
if (env.COCODE_HARNESS_ARGS?.trim() === undefined || env.COCODE_HARNESS_ARGS.trim() === '') {
  env.COCODE_HARNESS_ARGS = [
    '--import',
    'tsx/esm',
    resolve(packageRoot, 'dist', 'companion-runner.mjs'),
  ].join(',')
}
if (env.COCODE_HARNESS_CWD?.trim() === undefined || env.COCODE_HARNESS_CWD.trim() === '') {
  env.COCODE_HARNESS_CWD = process.cwd()
}

const result = spawnSync(process.execPath, [entry, ...args], {
  cwd: process.cwd(),
  env,
  stdio: 'inherit',
})

if (result.error) {
  process.stderr.write(`Cocode TUI failed to start: ${result.error.message}\n`)
  process.exit(1)
}
process.exit(result.status ?? 1)
