/**
 * Embedded harness lifecycle (RFC §4.2).
 *
 * The desktop carrier starts its own `dsh web` on a free loopback port so the
 * product never asks a user to run a server first. Every failure here is a
 * first-class interface state, not a silent blank window, so the process reports
 * a stderr tail the shell can show verbatim.
 *
 * In desktop dev (`COCODE_DEV_SERVER_URL`), dev-electron.mjs owns the harness
 * process and Vite proxies `/api` to it. The renderer stays same-origin (`baseUrl
 * === ''`) so harness Origin checks never block WebSocket downlinks.
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createServer, connect } from 'node:net'
import { existsSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'
import type { HarnessEndpointInfo, HarnessProcessState } from '../src/host/bridge.ts'

/** How much stderr to keep for the failure surface; enough for a stack, bounded for memory. */
const STDERR_TAIL_LIMIT = 4000
const READY_TIMEOUT_MS = 60_000

/** Reserves a free loopback port by binding and releasing it. */
async function freePort(): Promise<number> {
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

/** Resolves once the port accepts a TCP connection, or rejects at the deadline. */
async function waitForListen(port: number, signal: () => boolean): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS
  for (;;) {
    if (!signal()) throw new Error('harness process exited before it started listening')
    const reachable = await new Promise<boolean>(resolveWith => {
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
 * Locates the harness runtime this build should embed.
 * A packaged app resolves the runtime it ships; a development checkout resolves
 * the sibling clone. Returning `undefined` means the desktop carrier has no
 * runtime to embed and must fall back to connect mode.
 */
function hasGuiTerminals(root: string): boolean {
  return existsSync(resolvePath(root, 'packages/host/apiproxy/src/gui-terminals.ts'))
}

function resolveHarnessRoot(): string | undefined {
  const configured = process.env.COCODE_HARNESS_PATH
  const candidates = [
    ...(configured === undefined ? [] : [configured]),
    resolvePath(process.resourcesPath ?? '.', 'harness'),
    resolvePath(process.cwd(), '../../cocode-harness'),
    resolvePath(process.cwd(), '../cocode-harness'),
  ].filter(candidate => existsSync(resolvePath(candidate, 'package.json')))
  return candidates.find(hasGuiTerminals) ?? candidates[0]
}

/** Renderer base URL: same-origin in dev (Vite proxy), absolute otherwise. */
function rendererBaseUrl(harnessOrigin: string): string {
  return process.env.COCODE_DEV_SERVER_URL === undefined ? harnessOrigin : ''
}

export class HarnessProcess {
  private child: ChildProcessWithoutNullStreams | undefined
  private stderrTail = ''
  private info: HarnessEndpointInfo
  private readonly listeners = new Set<(info: HarnessEndpointInfo) => void>()
  private starting: Promise<HarnessEndpointInfo> | undefined
  private readonly managedHarness = process.env.COCODE_MANAGED_HARNESS === '1'

  constructor() {
    const explicitConnect = process.env.COCODE_HARNESS_MODE === 'connect'
    const configuredUrl = process.env.COCODE_HARNESS_URL
    if (this.managedHarness) {
      this.info = { mode: 'embedded', baseUrl: '', state: { phase: 'starting' } }
    }
    else if (explicitConnect) {
      this.info = {
        mode: 'connect',
        baseUrl: rendererBaseUrl(configuredUrl ?? 'http://127.0.0.1:3080'),
        state: { phase: 'starting' },
      }
    }
    else {
      this.info = { mode: 'embedded', baseUrl: '', state: { phase: 'starting' } }
    }
  }

  /** Current endpoint and process state. */
  snapshot(): HarnessEndpointInfo {
    return this.info
  }

  onStateChange(listener: (info: HarnessEndpointInfo) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Starts the embedded process if needed; connect mode resolves immediately. */
  async start(): Promise<HarnessEndpointInfo> {
    if (this.managedHarness) return this.attachManagedHarness()
    if (this.info.mode === 'connect') {
      this.publish({ phase: 'ready', baseUrl: this.info.baseUrl })
      return this.info
    }
    this.starting ??= this.spawnHarness().finally(() => { this.starting = undefined })
    return this.starting
  }

  /** Kills any running child and starts over. */
  async restart(): Promise<HarnessEndpointInfo> {
    if (this.managedHarness) {
      this.publish({ phase: 'starting' })
      return this.attachManagedHarness()
    }
    this.stop()
    this.publish({ phase: 'starting' })
    return this.start()
  }

  /** Terminates the child; called on window close and app quit so no orphan survives. */
  stop(): void {
    const child = this.child
    this.child = undefined
    if (child === undefined || child.exitCode !== null) return
    // The tree is a pnpm shim over node; SIGTERM lets the harness close its
    // sockets, and the exit handler below records whatever it reports.
    child.kill('SIGTERM')
  }

  private publish(state: HarnessProcessState, baseUrl = this.info.baseUrl): void {
    this.info = { ...this.info, baseUrl, state }
    for (const listener of this.listeners) listener(this.info)
  }

  private async attachManagedHarness(): Promise<HarnessEndpointInfo> {
    const configured = process.env.COCODE_HARNESS_URL
    if (configured === undefined || configured === '') {
      this.publish({
        phase: 'failed',
        message: '开发模式下未找到由 dev-electron 启动的 harness 端点。',
      })
      return this.info
    }

    try {
      const port = Number(new URL(configured).port)
      if (!Number.isInteger(port) || port <= 0) throw new Error(`invalid harness URL: ${configured}`)
      await waitForListen(port, () => true)
      this.publish({ phase: 'ready', baseUrl: '' }, '')
      return this.info
    }
    catch (error) {
      this.publish({
        phase: 'failed',
        message: error instanceof Error ? error.message : String(error),
      })
      return this.info
    }
  }

  private async spawnHarness(): Promise<HarnessEndpointInfo> {
    const root = resolveHarnessRoot()
    if (root === undefined) {
      this.publish({
        phase: 'failed',
        message: '未找到可内嵌的 harness 运行时。请设置 COCODE_HARNESS_PATH，或改用连接模式（COCODE_HARNESS_URL）。',
      })
      return this.info
    }

    try {
      const port = await freePort()
      const harnessOrigin = `http://127.0.0.1:${String(port)}`
      const child = spawn('pnpm', ['dsh', 'web', '--host', '127.0.0.1', '--port', String(port)], {
        cwd: root,
        env: { ...process.env, FORCE_COLOR: '0' },
        // Never a shell: the argv is fixed and a shell would only add quoting bugs.
        shell: false,
      }) as ChildProcessWithoutNullStreams

      this.child = child
      this.stderrTail = ''
      child.stderr.setEncoding('utf8')
      child.stderr.on('data', (chunk: string) => {
        this.stderrTail = (this.stderrTail + chunk).slice(-STDERR_TAIL_LIMIT)
      })
      child.on('error', error => {
        this.publish({ phase: 'failed', message: `无法启动 harness：${error.message}` })
      })
      child.on('exit', (code, signal) => {
        if (this.child !== child) return
        this.child = undefined
        this.publish({ phase: 'exited', code, signal, stderrTail: this.stderrTail })
      })

      await waitForListen(port, () => child.exitCode === null)
      const baseUrl = rendererBaseUrl(harnessOrigin)
      this.publish({ phase: 'ready', baseUrl }, baseUrl)
      return this.info
    }
    catch (error) {
      this.publish({
        phase: 'failed',
        message: `${error instanceof Error ? error.message : String(error)}\n${this.stderrTail}`.trim(),
      })
      return this.info
    }
  }
}
