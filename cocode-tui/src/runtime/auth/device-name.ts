import { hostname } from 'node:os'

const MAX_HOSTNAME_LENGTH = 80

/** Stable, device-oriented label shared by GUI and TUI on the same machine. */
export function deviceKeyName(currentHostname = hostname()): string {
  const safeHostname = currentHostname
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, MAX_HOSTNAME_LENGTH)
  return safeHostname === ''
    ? 'Cocode Device'
    : `Cocode Device — ${safeHostname}`
}
