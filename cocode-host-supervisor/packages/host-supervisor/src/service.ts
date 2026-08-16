import net from 'node:net'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, rmSync, writeFileSync, renameSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { endpointFor, descriptorPath, leaseDirectory, lockPath, scopePath } from './paths.js'
import { listenLineServer } from './ipc.js'
import { canonicalizeScope, HOST_PROTOCOL_REVISION, hostKey, isHostDescriptorCompatible, leaseId as makeLeaseId, LEASE_TTL_MS, SUPERVISOR_BUILD_REVISION, SUPERVISOR_PROTOCOL_REVISION, type AcquireHostRequest, type HostDescriptor, type HostScope } from './protocol.js'
import { prepareRuntimeSlot } from './runtime.js'

type LeaseRecord = { leaseId: string; clientKind: string; pid: number; createdAt: string; expiresAt: string }
type AcquireRequest = AcquireHostRequest & { clientPid?: number }
type HostProcess = { child: ReturnType<typeof spawn> | null; descriptor: HostDescriptor; idleTimer?: NodeJS.Timeout }

export async function runSupervisorService(stateDirectory: string): Promise<void> {
  mkdirSync(stateDirectory, { recursive: true, mode: 0o700 })
  const scope = JSON.parse(readFileSync(scopePath(stateDirectory), 'utf8')) as HostScope
  const service = new SupervisorService(stateDirectory, scope)
  await service.start()
  await service.wait()
}

class SupervisorService {
  private get endpoint(): string { return endpointFor(this.directory) }
  private readonly leases = new Map<string, LeaseRecord>()
  private host: HostProcess | null = null
  private server: net.Server | null = null
  private stopped = false
  private hadHost = false
  private lockOwned = false

  constructor(private readonly directory: string, private readonly scope: HostScope) {}

  async start(): Promise<void> {
    mkdirSync(leaseDirectory(this.directory), { recursive: true, mode: 0o700 })
    this.acquireLock()
    this.loadLeases()
    this.server = net.createServer((socket) => this.accept(socket))
    await listenLineServer(this.server, this.endpoint)
    if (process.platform !== 'win32') {
      const fs = await import('node:fs/promises')
      await fs.chmod(this.endpoint, 0o600).catch(() => undefined)
    }
    await this.recoverExistingHost()
  }

  wait(): Promise<void> {
    return new Promise((resolve) => {
      const poll = () => {
        if (this.stopped) { resolve(); return }
        this.cleanupLeases()
        if (this.hadHost && !this.host && this.leases.size === 0) { this.stop(); resolve(); return }
        setTimeout(poll, 2_000).unref()
      }
      poll()
    })
  }

  private accept(socket: net.Socket): void {
    let buffer = ''
    let chain = Promise.resolve()
    const onLine = (chunk: Buffer | string) => {
      buffer += chunk.toString()
      for (;;) {
        const newline = buffer.indexOf('\n')
        if (newline < 0) return
        const line = buffer.slice(0, newline).trim()
        buffer = buffer.slice(newline + 1)
        if (!line) continue
        chain = chain.then(() => this.handleRaw(socket, line)).catch(() => undefined)
      }
    }
    socket.on('data', onLine)
    socket.once('close', () => socket.off('data', onLine))
  }

  private async handleRaw(socket: net.Socket, line: string): Promise<void> {
    let frame: { id?: number; method?: string; params?: Record<string, unknown> }
    try { frame = JSON.parse(line) } catch { return }
    if (typeof frame.id !== 'number' || typeof frame.method !== 'string') return
    try {
      const result = await this.handle(frame.method, frame.params ?? {})
      socket.write(`${JSON.stringify({ jsonrpc: '2.0', id: frame.id, result })}\n`)
    } catch (error) {
      socket.write(`${JSON.stringify({ jsonrpc: '2.0', id: frame.id, error: { code: -32000, message: error instanceof Error ? error.message : String(error) } })}\n`)
    }
  }

  private async handle(method: string, params: Record<string, unknown>): Promise<unknown> {
    switch (method) {
      case 'acquire': return this.acquire(params as unknown as AcquireRequest)
      case 'renew': return this.renew(String(params.leaseId))
      case 'release': return this.release(String(params.leaseId))
      case 'status': return this.status()
      case 'doctor': return this.doctor()
      default: throw new Error(`unknown supervisor method: ${method}`)
    }
  }

  private async acquire(request: AcquireRequest): Promise<{ leaseId: string; expiresAt: string; descriptor: HostDescriptor }> {
    this.cleanupLeases()
    const requestedScope = canonicalizeScope(request.scope)
    if (JSON.stringify(requestedScope) !== JSON.stringify(this.scope)) {
      throw new Error('Host scope does not match this Supervisor scope')
    }
    if (!this.host || !isHostDescriptorCompatible(this.host.descriptor, this.scope, request)) {
      if (this.host && this.leases.size > 0) throw new Error('existing Host is incompatible while leases are active')
      if (this.host) await this.stopHost()
      try {
        await this.startHost(request)
      } catch (error) {
        // A failed first boot must not leave a Supervisor holding the scope
        // lock forever. The next client should be able to start fresh code.
        this.stop()
        throw error
      }
    }
    const id = makeLeaseId()
    const expiresAt = new Date(Date.now() + LEASE_TTL_MS).toISOString()
    const record = { leaseId: id, clientKind: request.clientKind, pid: Number.isInteger(request.clientPid) ? Number(request.clientPid) : process.ppid, createdAt: new Date().toISOString(), expiresAt }
    this.leases.set(id, record)
    this.persistLease(record)
    if (this.host?.idleTimer) { clearTimeout(this.host.idleTimer); delete this.host.idleTimer }
    return { leaseId: id, expiresAt, descriptor: this.host!.descriptor }
  }

  private async startHost(request: AcquireHostRequest): Promise<void> {
    const jsonRpcEndpoint = process.platform === 'win32' ? `\\\\.\\pipe\\cocode-dsh-jsonrpc-${hostKey(this.scope)}` : join(this.directory, 'dsh-jsonrpc.sock')
    const pluginPath = fileURLToPath(new URL('./host-jsonrpc-plugin.js', import.meta.url))
    const slot = prepareRuntimeSlot(this.scope, jsonRpcEndpoint, pluginPath)
    const workspace = join(this.scope.dshHome, 'workspaces', 'default')
    mkdirSync(workspace, { recursive: true })
    const args = this.scope.profile === 'web' ? ['web'] : ['--profile', this.scope.profile]
    args.push('--patch', slot.patch, '--port', '0')
    const child = spawn(process.execPath, [slot.entry, ...args], {
      cwd: workspace,
      env: { ...process.env, DSH_HOME: this.scope.dshHome, COCODE_DSH_PROFILE: this.scope.profile },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    child.once('exit', () => {
      if (this.host?.child !== child) return
      this.host = null
      rmSync(descriptorPath(this.directory), { force: true })
    })
    let output = ''
    const ready = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`DSH Host startup timed out.\n${output}`)), 60_000)
      const inspect = (chunk: Buffer | string) => {
        output += chunk.toString()
        const match = output.match(/dsh web: (http:\/\/127\.0\.0\.1:\d+)/)
        if (match?.[1]) { clearTimeout(timer); resolve(match[1]) }
      }
      child.stdout?.on('data', inspect)
      child.stderr?.on('data', (chunk) => { output += chunk.toString() })
      child.once('error', (error) => { clearTimeout(timer); reject(error) })
      child.once('exit', (code) => { if (code !== null) { clearTimeout(timer); reject(new Error(`DSH Host exited before ready: ${String(code)}\n${output}`)) } })
    })
    const webUrl = await ready
    await waitHttp(webUrl)
    await waitJsonRpc(jsonRpcEndpoint)
    const runtimeVersion = slot.version
    const descriptor: HostDescriptor = {
      schemaVersion: 1,
      hostKey: hostKey(this.scope),
      supervisorProtocolRevision: SUPERVISOR_PROTOCOL_REVISION,
      hostPid: child.pid ?? -1,
      supervisorPid: process.pid,
      dshHome: this.scope.dshHome,
      profile: this.scope.profile,
      runtimeVersion,
      ...(slot.buildId === undefined ? {} : { buildId: slot.buildId }),
      hostProtocolRevision: HOST_PROTOCOL_REVISION,
      hostConfigFingerprint: this.scope.hostConfigFingerprint,
      services: [
        { service: 'web', transport: 'tcp', endpoint: webUrl, protocolRevision: '1.0' },
        { service: 'jsonrpc', transport: process.platform === 'win32' ? 'named-pipe' : 'unix', endpoint: jsonRpcEndpoint, protocolRevision: '1.0' },
      ],
      capabilities: ['web', 'jsonrpc', 'session', 'event', 'workspace', 'approval', 'question'],
      startedAt: new Date().toISOString(),
    }
    this.host = { child, descriptor }
    this.hadHost = true
    this.writeDescriptor(descriptor)
  }

  private async status(): Promise<HostDescriptor | null> { return this.host?.descriptor ?? this.readDescriptor() }
  private renew(id: string): { expiresAt: string } { const record = this.leases.get(id); if (!record) throw new Error('unknown lease'); record.expiresAt = new Date(Date.now() + LEASE_TTL_MS).toISOString(); this.persistLease(record); return { expiresAt: record.expiresAt } }
  private async release(id: string): Promise<Record<string, never>> { this.leases.delete(id); rmSync(join(leaseDirectory(this.directory), `${id}.json`), { force: true }); if (this.leases.size === 0 && this.host) this.armIdleShutdown(); return {} }
  private armIdleShutdown(): void { if (!this.host || this.host.idleTimer) return; this.host.idleTimer = setTimeout(() => { void this.stopHost() }, Number(process.env.COCODE_HOST_IDLE_TIMEOUT_MS ?? 20_000)); this.host.idleTimer.unref?.() }
  private async stopHost(): Promise<void> {
    const host = this.host
    if (!host) return
    this.host = null
    const pid = host.child?.pid ?? host.descriptor.hostPid
    if (pid > 0 && isProcessAlive(pid)) {
      try {
        if (host.child !== null) host.child.kill('SIGTERM')
        else process.kill(pid, 'SIGTERM')
      } catch { /* the process may have exited between checks */ }
      await waitForProcessExit(pid, 2_000)
      if (isProcessAlive(pid)) {
        try { process.kill(pid, 'SIGKILL') } catch { /* already gone */ }
      }
    }
    rmSync(descriptorPath(this.directory), { force: true })
  }
  private cleanupLeases(): void { const now = Date.now(); for (const record of this.leases.values()) if (Date.parse(record.expiresAt) <= now) { this.leases.delete(record.leaseId); rmSync(join(leaseDirectory(this.directory), `${record.leaseId}.json`), { force: true }) } }
  private loadLeases(): void { for (const file of readdirSync(leaseDirectory(this.directory), { withFileTypes: true })) { if (!file.name.endsWith('.json')) continue; try { const record = JSON.parse(readFileSync(join(leaseDirectory(this.directory), file.name), 'utf8')) as LeaseRecord; if (Date.parse(record.expiresAt) > Date.now()) this.leases.set(record.leaseId, record) } catch { rmSync(join(leaseDirectory(this.directory), file.name), { force: true }) } } }
  private persistLease(record: LeaseRecord): void { writeFileSync(join(leaseDirectory(this.directory), `${record.leaseId}.json`), JSON.stringify(record) + '\n', { mode: 0o600 }) }
  private writeDescriptor(descriptor: HostDescriptor): void { const temp = `${descriptorPath(this.directory)}.${process.pid}.tmp`; writeFileSync(temp, JSON.stringify(descriptor, null, 2) + '\n', { mode: 0o600 }); renameSync(temp, descriptorPath(this.directory)) }
  private readDescriptor(): HostDescriptor | null { try { return JSON.parse(readFileSync(descriptorPath(this.directory), 'utf8')) as HostDescriptor } catch { return null } }
  private doctor(): Record<string, unknown> { return { supervisorProtocolRevision: SUPERVISOR_PROTOCOL_REVISION, supervisorBuildRevision: SUPERVISOR_BUILD_REVISION, scope: this.scope, descriptor: this.readDescriptor(), leaseCount: this.leases.size, pid: process.pid } }
  private stop(): void {
    if (this.stopped) return
    this.stopped = true
    void this.stopHost()
    this.server?.close()
    if (this.lockOwned) rmSync(lockPath(this.directory), { force: true })
    if (process.platform !== 'win32') rmSync(this.endpoint, { force: true })
  }

  private acquireLock(): void {
    for (;;) {
      try {
        const fd = openSync(lockPath(this.directory), 'wx', 0o600)
        try {
          writeFileSync(fd, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }) + '\n')
        } finally {
          closeSync(fd)
        }
        this.lockOwned = true
        return
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
        let pid: number | undefined
        try {
          const record = JSON.parse(readFileSync(lockPath(this.directory), 'utf8')) as { pid?: number }
          pid = record.pid
        } catch { /* stale or partially written lock */ }
        if (pid !== undefined && isProcessAlive(pid)) {
          throw new Error(`Host Supervisor is already running for ${this.directory}`)
        }
        rmSync(lockPath(this.directory), { force: true })
      }
    }
  }

  private async recoverExistingHost(): Promise<void> {
    const descriptor = this.readDescriptor()
    if (descriptor === null) return
    if (
      descriptor.hostKey !== hostKey(this.scope) ||
      descriptor.dshHome !== this.scope.dshHome ||
      descriptor.profile !== this.scope.profile ||
      descriptor.hostConfigFingerprint !== this.scope.hostConfigFingerprint
    ) {
      rmSync(descriptorPath(this.directory), { force: true })
      return
    }
    if (!isProcessAlive(descriptor.hostPid) || !(await hostHealth(descriptor))) {
      rmSync(descriptorPath(this.directory), { force: true })
      return
    }
    this.host = { child: null, descriptor }
    this.hadHost = true
    if (this.leases.size === 0) this.armIdleShutdown()
  }
}

async function waitHttp(url: string): Promise<void> { const deadline = Date.now() + 30_000; while (Date.now() < deadline) { try { const response = await fetch(url); if (response.ok) return } catch {} await new Promise((resolve) => setTimeout(resolve, 100)) } throw new Error(`DSH Web service did not become ready at ${url}`) }
async function waitJsonRpc(endpoint: string): Promise<void> {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    try {
      const socket = net.createConnection(endpoint)
      await new Promise<void>((resolve, reject) => {
        socket.once('connect', () => resolve())
        socket.once('error', reject)
      })
      socket.destroy()
      return
    } catch { /* retry until the Host plugin has bound its endpoint */ }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`DSH JSON-RPC service did not become ready at ${endpoint}`)
}

function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

async function waitForProcessExit(pid: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline && isProcessAlive(pid)) await new Promise((resolve) => setTimeout(resolve, 100))
}

async function hostHealth(descriptor: HostDescriptor): Promise<boolean> {
  const web = descriptor.services.find((service) => service.service === 'web')
  const jsonrpc = descriptor.services.find((service) => service.service === 'jsonrpc')
  if (web === undefined || jsonrpc === undefined) return false
  try {
    await fetch(web.endpoint)
    const socket = net.createConnection(jsonrpc.endpoint)
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve())
      socket.once('error', reject)
    })
    socket.destroy()
    return true
  } catch {
    return false
  }
}
