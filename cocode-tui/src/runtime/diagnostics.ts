/** Format safe runtime diagnostics without exposing credentials. */

import type { TuiCapabilities } from './capabilities.ts'

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
  sessionRoot?: string
}): string {
  const init =
    options.initError === undefined
      ? `initialize ok${options.runtimeName === '' ? '' : ` · ${options.runtimeName}`}`
      : `initialize error · ${redactSecrets(options.initError)}`
  const caps = Object.entries(options.capabilities)
    .map(([key, value]) => `${key}=${String(value)}`)
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
    options.sessionRoot === undefined
      ? 'session-root unset'
      : `session-root ${options.sessionRoot}`,
    'secrets omitted; do not edit credentials concurrently with GUI',
  ].join(' · ')
}

export function redactSecrets(value: string): string {
  return value
    .replace(/(?:[A-Z][A-Z0-9_]*_)?API_KEY\s*=\s*[^\s·]+/gi, '[redacted]')
    .replace(/(?:sk-|sk_|ck_(?:live|test)_)[A-Za-z0-9_-]+/g, '[redacted]')
}
