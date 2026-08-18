/** Format safe runtime diagnostics without exposing credentials. */

import type { TuiCapabilities } from './capabilities.ts'
import type { TuiCapabilitySnapshot } from '@cocode/tui-connection'

export function formatDoctor(options: {
  tty: boolean
  launchConfigured: boolean
  argsConfigured: boolean
  initError?: string
  runtimeName: string
  cwd: string
  provider: string
  model: string
  sessionId: string
  capabilities: TuiCapabilities
  configuredCapabilities: TuiCapabilities
  runtimeCapabilities?: TuiCapabilitySnapshot
  sessionRoot?: string
  runtimeHome?: string
  sharedDshHome?: string
}): string {
  const init =
    options.initError === undefined
      ? `initialize ok${options.runtimeName === '' ? '' : ` · ${options.runtimeName}`}`
      : `initialize error · ${redactSecrets(options.initError)}`
  const caps = Object.entries(options.capabilities)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(',')
  const configuredCaps = formatCapabilityMap(options.configuredCapabilities)
  const runtimeCaps =
    options.runtimeCapabilities === undefined
      ? 'unavailable'
      : formatCapabilityMap(options.runtimeCapabilities.capabilities)
  const runtimeErrors =
    options.runtimeCapabilities === undefined
      ? undefined
      : Object.entries(options.runtimeCapabilities.errors)
          .map(([key, value]) => `${key}=${value}`)
          .join(',')
  return [
    `tty ${options.tty ? 'yes' : 'no'}`,
    `launch ${options.launchConfigured ? 'set' : 'unset'}`,
    `args ${options.argsConfigured ? 'set' : 'unset'}`,
    init,
    `cwd ${options.cwd}`,
    `provider ${options.provider}`,
    `model ${options.model}`,
    `session ${options.sessionId}`,
    `caps ${caps}`,
    `caps-configured ${configuredCaps}`,
    `caps-runtime ${runtimeCaps}`,
    runtimeErrors === undefined || runtimeErrors === ''
      ? undefined
      : `caps-errors ${runtimeErrors}`,
    options.sessionRoot === undefined
      ? 'session-root unset'
      : `session-root ${options.sessionRoot}`,
    options.runtimeHome === undefined ? undefined : `runtime-home ${options.runtimeHome}`,
    options.sharedDshHome === undefined ? undefined : `dsh-home ${options.sharedDshHome}`,
    'profile cocode · shared-write enabled · concurrent-mutation unsupported · home-patch shared · home-patch-isolation unavailable · profile-fallback shared',
    'secrets omitted; do not edit credentials concurrently with GUI',
  ]
    .filter((value): value is string => value !== undefined)
    .join(' · ')
}

function formatCapabilityMap(capabilities: Record<string, unknown>): string {
  return Object.entries(capabilities)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(',')
}

export function redactSecrets(value: string): string {
  return value
    .replace(/(?:[A-Z][A-Z0-9_]*_)?API_KEY\s*=\s*[^\s·]+/gi, '[redacted]')
    .replace(/(?:sk-|sk_|ck_(?:live|test)_)[A-Za-z0-9_-]+/g, '[redacted]')
}
