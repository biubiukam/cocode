/**
 * Desktop dev entry: Vite dev server + Electron carrier in one process tree.
 * Browser-only development uses `pnpm run dev:web`.
 */

import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { ensureHarness, isConnectMode, spawnManagedHarness, stopManagedHarness } from './harness-dev.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const DEV_SERVER_URL = process.env.COCODE_DEV_SERVER_URL ?? 'http://localhost:5273'
const DEV_SERVER_PORT = new URL(DEV_SERVER_URL).port || '5273'
const viteBin = join(root, 'node_modules/vite/bin/vite.js')

/** True when the dev server is already listening. */
async function isDevServerRunning(url) {
  try {
    const response = await fetch(url, { method: 'HEAD' })
    return response.status < 500
  }
  catch {
    return false
  }
}

/** Resolves once the dev server answers, so Electron never loads a dead URL. */
async function waitForDevServer(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    if (await isDevServerRunning(url)) return
    if (Date.now() > deadline) throw new Error(`dev server did not answer at ${url}`)
    await new Promise(resolve => setTimeout(resolve, 250))
  }
}

/** Frees loopback listeners that block the dev port but are not serving. */
function reclaimDevPort(port) {
  if (process.platform === 'win32') return
  const result = spawnSync('lsof', ['-ti', `:${port}`], { encoding: 'utf8' })
  const pids = result.stdout
    .split('\n')
    .map(line => Number.parseInt(line.trim(), 10))
    .filter(pid => Number.isInteger(pid) && pid !== process.pid)
  for (const pid of pids) {
    try { process.kill(pid, 'SIGTERM') } catch { /* already gone */ }
  }
}

const children = []
let shuttingDown = false

function track(child, { group = false } = {}) {
  child.__killGroup = group
  children.push(child)
  return child
}

async function shutdown(code = 0) {
  if (shuttingDown) return
  shuttingDown = true

  const exits = []
  for (const child of children) {
    if (child.killed || child.pid === undefined) continue
    try {
      if (child.__killGroup && process.platform !== 'win32') process.kill(-child.pid, 'SIGTERM')
      else child.kill('SIGTERM')
    }
    catch {
      try { child.kill('SIGTERM') } catch { /* already gone */ }
    }
    exits.push(once(child, 'exit'))
  }

  await Promise.race([
    Promise.all(exits),
    new Promise(resolve => setTimeout(resolve, 2_000)),
  ])

  for (const child of children) {
    if (child.killed || child.pid === undefined) continue
    try {
      if (child.__killGroup && process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL')
      else child.kill('SIGKILL')
    }
    catch { /* already gone */ }
  }

  stopManagedHarness(managedHarness)

  process.exit(code)
}

process.on('SIGINT', () => { void shutdown(130) })
process.on('SIGTERM', () => { void shutdown(143) })

ensureHarness()

/** Embedded harness for dev; owned here so Vite can proxy before Electron opens. */
let managedHarness
if (!isConnectMode()) {
  try {
    managedHarness = await spawnManagedHarness()
    process.env.COCODE_HARNESS_URL = managedHarness.url
    process.env.COCODE_MANAGED_HARNESS = '1'
    console.log(`[dev] harness at ${managedHarness.url} (proxied via Vite)`)
  }
  catch (error) {
    console.error(`[dev] failed to start harness: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}

if (!isConnectMode() && await isDevServerRunning(DEV_SERVER_URL)) {
  console.log('restarting dev server so the harness proxy target matches')
  reclaimDevPort(DEV_SERVER_PORT)
  await new Promise(resolve => setTimeout(resolve, 300))
}

if (await isDevServerRunning(DEV_SERVER_URL)) {
  console.log(`reusing dev server at ${DEV_SERVER_URL}`)
}
else {
  if (spawnSync('lsof', ['-ti', `:${DEV_SERVER_PORT}`], { encoding: 'utf8' }).stdout.trim()) {
    console.log(`reclaiming port ${DEV_SERVER_PORT}`)
    reclaimDevPort(DEV_SERVER_PORT)
    await new Promise(resolve => setTimeout(resolve, 300))
  }

  const vite = track(spawn(process.execPath, [viteBin], {
    cwd: root,
    stdio: 'inherit',
    detached: process.platform !== 'win32',
  }), { group: true })
  vite.on('exit', code => {
    if (!shuttingDown && code !== 0 && code !== null) void shutdown(code)
  })

  await waitForDevServer(DEV_SERVER_URL)
}

const build = spawn(process.execPath, ['scripts/build-electron.mjs'], { cwd: root, stdio: 'inherit' })
const [buildCode] = await once(build, 'exit')
if (buildCode !== 0) await shutdown(buildCode ?? 1)

const require = createRequire(import.meta.url)
const electron = require('electron')

const app = track(spawn(electron, ['.'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, COCODE_DEV_SERVER_URL: DEV_SERVER_URL },
}))
const [appCode] = await once(app, 'exit')
await shutdown(appCode ?? 0)
