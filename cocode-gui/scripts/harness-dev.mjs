/**
 * Harness checkout resolution, build checks, and dev-time process spawn.
 * Used by ensure-harness.mjs and dev-electron.mjs.
 */

import { spawn, spawnSync } from 'node:child_process'
import { connect, createServer } from 'node:net'
import { existsSync, mkdirSync, readFileSync, cpSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

function nestedHarnessRoot() {
  return resolve(guiRoot, '../cocode-harness')
}

const here = dirname(fileURLToPath(import.meta.url))
const guiRoot = join(here, '..')
const READY_TIMEOUT_MS = 60_000

/** True only when the user explicitly opts into connect mode. */
export function isConnectMode() {
  return process.env.COCODE_HARNESS_MODE === 'connect'
}

function isHarnessCheckout(candidate) {
  return existsSync(join(candidate, 'package.json'))
}

/** GUI terminal PTYs live here; public clones may omit it. */
function hasGuiTerminals(candidate) {
  return existsSync(join(candidate, 'packages/host/apiproxy/src/gui-terminals.ts'))
}

export function resolveHarnessRoot() {
  const configured = process.env.COCODE_HARNESS_PATH
  const candidates = [
    ...(configured === undefined ? [] : [resolve(configured)]),
    // Sibling clone is canonical (AGENTS.md); nested copies are often incomplete.
    resolve(guiRoot, '../../cocode-harness'),
    resolve(guiRoot, '../cocode-harness'),
  ].filter(isHarnessCheckout)
  return candidates.find(hasGuiTerminals) ?? candidates[0]
}

function harnessBuildMarker(root) {
  return join(root, 'packages/host/apiproxy/lib/index.js')
}

/** The GUI terminal panel needs apiproxy's bundled handler, not only its .ts sources. */
function harnessRuntimeReady(root) {
  const bundle = harnessBuildMarker(root)
  if (!existsSync(bundle)) return false
  try {
    return readFileSync(bundle, 'utf8').includes('terminal.create')
  }
  catch {
    return false
  }
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', env: process.env, shell: false })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

/** Profile symlinks still resolve apiproxy from the nested public clone; mirror the built lib. */
export function syncNestedApiproxyRuntime(canonicalRoot) {
  const nestedRoot = nestedHarnessRoot()
  if (!isHarnessCheckout(nestedRoot) || resolve(nestedRoot) === resolve(canonicalRoot)) return
  if (!harnessRuntimeReady(canonicalRoot)) return

  const from = harnessBuildMarker(canonicalRoot)
  const toDir = join(nestedRoot, 'packages/host/apiproxy/lib')
  if (!existsSync(from)) return

  mkdirSync(toDir, { recursive: true })
  cpSync(from, join(toDir, 'index.js'), { force: true })
  const fromInvariant = join(dirname(from), 'invariant.js')
  if (existsSync(fromInvariant)) cpSync(fromInvariant, join(toDir, 'invariant.js'), { force: true })
  console.log('[ensure-harness] synced apiproxy runtime into nested harness checkout')
}

export function ensureHarness() {
  if (isConnectMode()) return

  const root = resolveHarnessRoot()
  if (root === undefined) {
    console.warn('[ensure-harness] no harness checkout found; embedded mode may fail at runtime')
    return
  }

  const needsInstall = !existsSync(join(root, 'node_modules'))
  const needsBuild = !harnessRuntimeReady(root)

  if (!needsInstall && !needsBuild) {
    syncNestedApiproxyRuntime(root)
    console.log('[ensure-harness] harness runtime ready')
    return
  }

  if (needsInstall) {
    console.log(`[ensure-harness] installing dependencies in ${root}`)
    run('pnpm', ['install'], root)
  }

  if (needsBuild || needsInstall) {
    console.log(`[ensure-harness] building harness runtime in ${root}`)
    run('pnpm', ['run', 'build'], root)
  }

  syncNestedApiproxyRuntime(root)
}

async function freePort() {
  return new Promise((resolveWith, reject) => {
    const server = createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        server.close(() => reject(new Error('could not reserve a loopback port')))
        return
      }
      const { port } = address
      server.close(() => resolveWith(port))
    })
  })
}

async function waitForListen(port, alive) {
  const deadline = Date.now() + READY_TIMEOUT_MS
  for (;;) {
    if (!alive()) throw new Error('harness process exited before it started listening')
    const reachable = await new Promise(resolveWith => {
      const socket = connect({ port, host: '127.0.0.1' })
      socket.once('connect', () => { socket.destroy(); resolveWith(true) })
      socket.once('error', () => { socket.destroy(); resolveWith(false) })
    })
    if (reachable) return
    if (Date.now() > deadline) throw new Error(`harness did not listen on 127.0.0.1:${String(port)} in time`)
    await new Promise(done => setTimeout(done, 200))
  }
}

/**
 * Starts an embedded harness for desktop dev. The Vite proxy forwards /api to
 * this origin so the renderer can stay same-origin and avoid harness Origin checks.
 */
export async function spawnManagedHarness() {
  const root = resolveHarnessRoot()
  if (root === undefined) throw new Error('no harness checkout found for embedded dev')

  syncNestedApiproxyRuntime(root)

  const port = await freePort()
  const url = `http://127.0.0.1:${String(port)}`
  const child = spawn('pnpm', ['dsh', 'web', '--host', '127.0.0.1', '--port', String(port)], {
    cwd: root,
    env: { ...process.env, FORCE_COLOR: '0' },
    shell: false,
    detached: process.platform !== 'win32',
  })

  child.on('exit', (code, signal) => {
    if (code === 0 || code === null) return
    console.error(`[dev] harness exited (code=${String(code)}, signal=${String(signal)})`)
  })

  await waitForListen(port, () => child.exitCode === null)
  return { child, port, url }
}

/** Stops a harness child started by spawnManagedHarness. */
export function stopManagedHarness(managed) {
  if (managed?.child === undefined || managed.child.exitCode !== null) return
  try {
    if (process.platform !== 'win32' && managed.child.pid !== undefined) process.kill(-managed.child.pid, 'SIGTERM')
    else managed.child.kill('SIGTERM')
  }
  catch {
    try { managed.child.kill('SIGTERM') } catch { /* already gone */ }
  }
}
