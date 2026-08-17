import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { endpointFor, leaseDirectory, scopeDirectory, scopePath, supervisorHome } from './paths.js'
import { canonicalizeScope, isHostDescriptorCompatible, LEASE_TTL_MS, SUPERVISOR_BUILD_REVISION, type AcquireHostRequest, type HostDescriptor, type HostLease, type HostScope, type HostSupervisorClient } from './protocol.js'
import { openLineConnection, type LinePeer } from './ipc.js'

export type SupervisorClientOptions = {
  nodeExecutable?: string
  serviceEntry?: string
  startupTimeoutMs?: number
}

/** The stale Host is stopped first, so its Supervisor only has to unwind itself. */
const STALE_TERMINATE_GRACE_MS = 5_000
const STALE_KILL_GRACE_MS = 2_000

type SupervisorDoctor = {
  supervisorBuildRevision?: string
  leaseCount?: number
  pid?: number
  descriptor?: HostDescriptor | null
}

/** Keep an active compatible Host usable while its supervisor is being upgraded. */
export function canReuseOlderSupervisor(
  request: AcquireHostRequest,
  doctor: SupervisorDoctor,
): boolean {
  if ((doctor.leaseCount ?? 0) <= 0) return false
  return doctor.descriptor !== undefined && doctor.descriptor !== null && isHostDescriptorCompatible(
    doctor.descriptor,
    request.scope,
    request,
  )
}

export class LocalHostSupervisorClient implements HostSupervisorClient {
  private readonly activeLeases = new Map<string, { peer: LinePeer; timer: NodeJS.Timeout }>()

  constructor(private readonly options: SupervisorClientOptions = {}) {}

  async acquire(request: AcquireHostRequest): Promise<HostLease> {
    const scope = canonicalizeScope(request.scope)
    const directory = scopeDirectory(scope)
    mkdirSync(directory, { recursive: true, mode: 0o700 })
    writeFileSync(scopePath(directory), JSON.stringify(scope) + '\n', { mode: 0o600 })
    const peer = await this.connectOrStart(directory, request)
    let result: { leaseId: string; expiresAt: string; descriptor: HostDescriptor }
    try {
      result = await peer.request<{ leaseId: string; expiresAt: string; descriptor: HostDescriptor }>('acquire', {
        ...request,
        scope,
        clientPid: process.pid,
      })
    } catch (error) {
      peer.close()
      throw error
    }
    let released = false
    const renew = async () => {
      if (released) return
      const renewed = await peer.request<{ expiresAt: string }>('renew', { leaseId: result.leaseId })
      result.expiresAt = renewed.expiresAt
    }
    const timer = setInterval(() => { void renew().catch(() => undefined) }, Math.floor(LEASE_TTL_MS / 3))
    timer.unref?.()
    this.activeLeases.set(result.leaseId, { peer, timer })
    return {
      leaseId: result.leaseId,
      expiresAt: result.expiresAt,
      logDirectory: join(directory, 'logs', 'host'),
      descriptor: result.descriptor,
      renew,
      release: async () => {
        if (released) return
        released = true
        await this.release(result.leaseId)
      },
    }
  }

  async status(scope: HostScope): Promise<HostDescriptor | null> {
    const directory = scopeDirectory(canonicalizeScope(scope))
    let peer: LinePeer | undefined
    try {
      peer = await openLineConnection(endpointFor(directory))
      return await peer.request<HostDescriptor | null>('status', { scope: canonicalizeScope(scope) })
    } catch { return null }
    finally {
      // `peer` is intentionally scoped to this status request and never owns a lease.
      // The finally block is below the try so connection errors are also cleaned up.
      peer?.close()
    }
  }

  async release(leaseId: string): Promise<void> {
    const active = this.activeLeases.get(leaseId)
    if (active !== undefined) {
      this.activeLeases.delete(leaseId)
      clearInterval(active.timer)
      await active.peer.request('release', { leaseId }).catch(() => undefined)
      active.peer.close()
      return
    }
    const home = supervisorHome()
    if (!existsSync(home)) throw new Error(`unknown lease: ${leaseId}`)
    for (const entry of readdirSync(home, { withFileTypes: true, encoding: 'utf8' })) {
      if (!entry.isDirectory()) continue
      const directory = join(home, entry.name)
      if (!existsSync(join(leaseDirectory(directory), `${leaseId}.json`))) continue
      try {
        const peer = await openLineConnection(endpointFor(directory))
        await peer.request('release', { leaseId }).catch(() => undefined)
        peer.close()
        return
      } catch {
        // A dead Supervisor will let the lease expire; do not delete another
        // scope's state merely because its socket is temporarily unavailable.
      }
    }
    throw new Error(`unknown lease: ${leaseId}`)
  }

  private async connectOrStart(directory: string, request: AcquireHostRequest): Promise<LinePeer> {
    const endpoint = endpointFor(directory)
    let existing: LinePeer | undefined
    try { existing = await openLineConnection(endpoint) } catch { /* start below */ }
    if (existing !== undefined) {
      try {
        const doctor = await existing.request<SupervisorDoctor>('doctor')
        if (doctor.supervisorBuildRevision === SUPERVISOR_BUILD_REVISION) return existing
        if (canReuseOlderSupervisor(request, doctor)) return existing
        existing.close()
        if ((doctor.leaseCount ?? 0) > 0) {
          throw new Error('Host Supervisor is running an older build while active clients still hold leases; release them before upgrading.')
        }
        await stopStaleSupervisor(doctor.pid, doctor.descriptor?.hostPid)
      } catch (error) {
        existing.close()
        throw error
      }
    }
    const serviceEntry = this.options.serviceEntry ?? process.env.COCODE_SUPERVISOR_SERVICE_ENTRY ?? resolveLocalServiceEntry()
    const node = this.options.nodeExecutable ?? resolveNodeExecutable()
    const child = spawn(node, [serviceEntry, 'service', '--state-dir', directory], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, COCODE_SUPERVISOR_STATE_DIR: directory },
    })
    child.unref()
    const deadline = Date.now() + (this.options.startupTimeoutMs ?? 15_000)
    let lastError: unknown
    while (Date.now() < deadline) {
      try { return await openLineConnection(endpoint) } catch (error) { lastError = error; await new Promise((resolve) => setTimeout(resolve, 100)) }
    }
    throw new Error(`Host Supervisor did not become ready: ${String(lastError)}`)
  }
}

function resolveLocalServiceEntry(): string {
  const url = new URL('./bin.js', import.meta.url)
  if (url.protocol !== 'file:') {
    throw new Error(`Host Supervisor service entry is unavailable from a bundled module URL (${url.protocol}).`)
  }
  return fileURLToPath(url)
}

async function stopStaleSupervisor(supervisorPid: number | undefined, hostPid: number | undefined): Promise<void> {
  if (hostPid !== undefined && isProcessAlive(hostPid)) await terminateProcess(hostPid, 'DSH Host')
  if (supervisorPid !== undefined && isProcessAlive(supervisorPid)) await terminateProcess(supervisorPid, 'Host Supervisor')
}

/** A stale process that ignores SIGTERM must never block the next client from starting. */
async function terminateProcess(pid: number, label: string): Promise<void> {
  try { process.kill(pid, 'SIGTERM') } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return
    throw new Error(`Unable to stop stale ${label} (${pid}): ${String(error)}`)
  }
  if (await waitForProcessExit(pid, STALE_TERMINATE_GRACE_MS)) return
  try { process.kill(pid, 'SIGKILL') } catch { /* already gone */ }
  if (await waitForProcessExit(pid, STALE_KILL_GRACE_MS)) return
  throw new Error(`Stale ${label} (${pid}) did not exit after SIGKILL.`)
}

async function waitForProcessExit(pid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline && isProcessAlive(pid)) {
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return !isProcessAlive(pid)
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

export function createHostSupervisorClient(options?: SupervisorClientOptions): HostSupervisorClient {
  return new LocalHostSupervisorClient(options)
}

export function resolveNodeExecutable(): string {
  const explicit = process.env.COCODE_NODE_EXECUTABLE?.trim()
  if (explicit) return explicit
  const npmNode = process.env.npm_node_execpath?.trim()
  if (npmNode) return npmNode
  return process.execPath.includes('Electron') || process.execPath.endsWith('electron') ? 'node' : process.execPath
}
