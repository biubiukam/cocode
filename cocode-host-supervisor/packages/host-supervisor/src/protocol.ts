import { createHash, randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

export type HostClientKind = 'gui' | 'desktop-tui' | 'standalone-tui'
export type HostServiceName = 'web' | 'jsonrpc'
export type RuntimeChannel = 'stable' | 'preview' | 'dev'
export type HostRuntimeEnv = Readonly<{
  COCODE_LLM_PROVIDERS?: string
  COCODE_VISION_CONFIG?: string
}>

export interface HostScope {
  dshHome: string
  profile: string
  hostConfigFingerprint: string
  runtimeChannel: RuntimeChannel
}

export interface AcquireHostRequest {
  scope: HostScope
  clientKind: HostClientKind
  requiredServices: readonly HostServiceName[]
  requiredCapabilities?: readonly string[]
  minProtocolRevision: string
  /** Non-secret process configuration required when materializing a new Host. */
  runtimeEnv?: HostRuntimeEnv
}

export interface HostServiceEndpoint {
  service: HostServiceName
  transport: 'tcp' | 'unix' | 'named-pipe'
  endpoint: string
  protocolRevision: string
  token?: string
}

export interface HostDescriptor {
  schemaVersion: 1
  hostKey: string
  supervisorProtocolRevision: string
  hostPid: number
  supervisorPid: number
  dshHome: string
  profile: string
  runtimeVersion: string
  buildId?: string
  hostProtocolRevision: string
  hostConfigFingerprint: string
  services: readonly HostServiceEndpoint[]
  capabilities: readonly string[]
  startedAt: string
}

export interface HostLease {
  leaseId: string
  expiresAt: string
  logDirectory: string
  descriptor: HostDescriptor
  renew(): Promise<void>
  release(): Promise<void>
}

export interface HostSupervisorClient {
  acquire(request: AcquireHostRequest): Promise<HostLease>
  status(scope: HostScope): Promise<HostDescriptor | null>
  stop(scope: HostScope, options?: { force?: boolean }): Promise<{ stopped: boolean; descriptor: HostDescriptor | null }>
  release(leaseId: string): Promise<void>
}

export const SUPERVISOR_PROTOCOL_REVISION = '1.0'
export const SUPERVISOR_BUILD_REVISION = 'runtime-lifecycle-v5'
export const HOST_PROTOCOL_REVISION = '1.0'
export const LEASE_TTL_MS = 30_000

/**
 * Resolve the non-secret runtime configuration that must be identical for
 * every client sharing a Host. Keep this next to the scope canonicalization so
 * GUI, TUI, and standalone diagnostics cannot accidentally derive different
 * Host keys from the same process environment.
 */
export function resolveHostRuntimeEnv(env: NodeJS.ProcessEnv): HostRuntimeEnv {
  const providers = nonemptyEnv(env.COCODE_LLM_PROVIDERS)
  const visionConfig = resolveVisionConfigPath(env)

  return {
    ...(providers === undefined ? {} : { COCODE_LLM_PROVIDERS: providers }),
    ...(visionConfig === undefined ? {} : { COCODE_VISION_CONFIG: visionConfig }),
  }
}

function resolveVisionConfigPath(env: NodeJS.ProcessEnv): string | undefined {
  const configured = nonemptyEnv(env.COCODE_VISION_CONFIG)
  if (configured !== undefined) return resolveUserPath(configured)
  const home = nonemptyEnv(env.COCODE_HOME)
  return home === undefined ? undefined : join(resolveUserPath(home), 'vision.yaml')
}

function nonemptyEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed === undefined || trimmed === '' ? undefined : trimmed
}

export function resolveHostScope(env: NodeJS.ProcessEnv = process.env): HostScope {
  const runtimeEnv = resolveHostRuntimeEnv(env)
  const baseFingerprint = env.COCODE_HOST_CONFIG_FINGERPRINT?.trim() || 'cocode-web-jsonrpc-v1'
  return canonicalizeScope({
    dshHome: env.DSH_HOME?.trim() || `${homedir()}/.dsh`,
    profile: env.DSH_PROFILE?.trim() || 'web',
    hostConfigFingerprint: Object.keys(runtimeEnv).length === 0
      ? baseFingerprint
      : `${baseFingerprint}:${fingerprint(runtimeEnv)}`,
    runtimeChannel: env.COCODE_RUNTIME_CHANNEL === 'preview' || env.COCODE_RUNTIME_CHANNEL === 'dev'
      ? env.COCODE_RUNTIME_CHANNEL
      : 'stable',
  })
}

export function canonicalizeScope(scope: HostScope): HostScope {
  const dshHome = resolveUserPath(scope.dshHome.trim() || `${homedir()}/.dsh`)
  const profile = scope.profile.trim() || 'web'
  const fingerprint = scope.hostConfigFingerprint.trim() || 'default'
  const runtimeChannel = scope.runtimeChannel === 'preview' || scope.runtimeChannel === 'dev'
    ? scope.runtimeChannel
    : 'stable'
  return { dshHome, profile, hostConfigFingerprint: fingerprint, runtimeChannel }
}

export function expandTildePath(value: string, userHome: string = homedir()): string {
  const trimmed = value.trim()
  if (trimmed === '~') return userHome
  if (!/^~[\\/]/.test(trimmed)) return trimmed
  return `${userHome.replace(/[\\/]$/, '')}${trimmed.slice(1)}`
}

export function resolveUserPath(value: string, userHome: string = homedir()): string {
  return resolve(expandTildePath(value, userHome))
}

export function hostKey(scope: HostScope): string {
  const normalized = canonicalizeScope(scope)
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex').slice(0, 32)
}

export function fingerprint(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex').slice(0, 32)
}

export function leaseId(): string {
  return randomUUID()
}

export function stableJson(value: unknown): string {
  if (value === undefined) return 'undefined'
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`
}

export function isHostDescriptorCompatible(
  descriptor: HostDescriptor,
  scope: HostScope,
  request: Pick<AcquireHostRequest, 'requiredServices' | 'requiredCapabilities' | 'minProtocolRevision'>,
): boolean {
  const normalized = canonicalizeScope(scope)
  if (descriptor.hostKey !== hostKey(normalized)) return false
  if (descriptor.dshHome !== normalized.dshHome) return false
  if (descriptor.profile !== normalized.profile) return false
  if (descriptor.hostConfigFingerprint !== normalized.hostConfigFingerprint) return false
  if (descriptor.supervisorProtocolRevision.split('.')[0] !== SUPERVISOR_PROTOCOL_REVISION.split('.')[0]) return false
  if (descriptor.hostProtocolRevision.split('.')[0] !== request.minProtocolRevision.split('.')[0]) return false
  if (!request.requiredServices.every((service) => descriptor.services.some((entry) => entry.service === service))) return false
  return (request.requiredCapabilities ?? []).every((capability) => descriptor.capabilities.includes(capability))
}
