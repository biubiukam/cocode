import { LEASE_TTL_MS, type HostClientKind } from './protocol.js'

export const HOST_ACQUIRE_ABANDONED_MESSAGE =
  'Host acquire client disconnected before lease creation'

export type LeaseRecord = {
  leaseId: string
  clientKind: string
  pid: number
  createdAt: string
  expiresAt: string
}

export function createLeaseRecord(options: {
  leaseId: string
  clientKind: HostClientKind
  clientPid?: number
  fallbackPid: number
  now?: number
  ttlMs?: number
  signal?: AbortSignal
}): LeaseRecord | undefined {
  if (options.signal?.aborted) return undefined
  const now = options.now ?? Date.now()
  const ttlMs = options.ttlMs ?? LEASE_TTL_MS
  return {
    leaseId: options.leaseId,
    clientKind: options.clientKind,
    pid: Number.isInteger(options.clientPid) ? Number(options.clientPid) : options.fallbackPid,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttlMs).toISOString(),
  }
}

export function isLeaseActive(
  record: LeaseRecord,
  now: number,
  processAlive: (pid: number) => boolean,
): boolean {
  return Date.parse(record.expiresAt) > now && processAlive(record.pid)
}
