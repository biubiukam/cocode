export type LeaseRecord = {
  leaseId: string
  clientKind: string
  pid: number
  createdAt: string
  expiresAt: string
}

export function isLeaseActive(
  record: LeaseRecord,
  now: number,
  processAlive: (pid: number) => boolean,
): boolean {
  return Date.parse(record.expiresAt) > now && processAlive(record.pid)
}
