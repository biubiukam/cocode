/** Resolve the session-log root shared by the TUI and its child runtime. */

import { homedir as osHomedir } from 'node:os'
import { isAbsolute, resolve } from 'node:path'

export type SessionRootSource = 'DSH_SESSION_ROOT' | 'DSH_HOME' | 'default'

export type SessionRoot = {
  path: string
  source: SessionRootSource
}

export function resolveSessionRoot(options: {
  env?: NodeJS.ProcessEnv
  cwd?: string
  homedir?: string
}): SessionRoot {
  const env = options.env ?? process.env
  const cwd = resolve(options.cwd ?? process.cwd())
  const configuredRoot = nonempty(env.DSH_SESSION_ROOT)
  if (configuredRoot !== undefined) {
    return {
      path: resolveFromCwd(configuredRoot, cwd),
      source: 'DSH_SESSION_ROOT',
    }
  }

  const configuredHome = nonempty(env.DSH_HOME)
  if (configuredHome !== undefined) {
    return {
      path: resolve(configuredHome, 'sessions'),
      source: 'DSH_HOME',
    }
  }

  return {
    path: resolve(options.homedir ?? osHomedir(), '.dsh', 'sessions'),
    source: 'default',
  }
}

function nonempty(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed === undefined || trimmed === '' ? undefined : trimmed
}

function resolveFromCwd(path: string, cwd: string): string {
  return isAbsolute(path) ? resolve(path) : resolve(cwd, path)
}
