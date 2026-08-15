/** Resolve the session-log root shared by the TUI and its child runtime. */

import { homedir as osHomedir } from 'node:os'
import { pathForPlatform } from './platform.ts'

export type SessionRootSource = 'DSH_SESSION_ROOT' | 'DSH_HOME' | 'default'

export type SessionRoot = {
  path: string
  source: SessionRootSource
}

export function resolveSessionRoot(options: {
  env?: NodeJS.ProcessEnv
  cwd?: string
  homedir?: string
  platform?: NodeJS.Platform
}): SessionRoot {
  const env = options.env ?? process.env
  const pathApi = pathForPlatform(options.platform)
  const cwd = pathApi.resolve(options.cwd ?? process.cwd())
  const configuredRoot = nonempty(env.DSH_SESSION_ROOT)
  if (configuredRoot !== undefined) {
    return {
      path: resolveFromCwd(configuredRoot, cwd, pathApi),
      source: 'DSH_SESSION_ROOT',
    }
  }

  const configuredHome = nonempty(env.DSH_HOME)
  if (configuredHome !== undefined) {
    return {
      path: pathApi.resolve(configuredHome, 'sessions'),
      source: 'DSH_HOME',
    }
  }

  return {
    path: pathApi.resolve(options.homedir ?? osHomedir(), '.dsh', 'sessions'),
    source: 'default',
  }
}

function nonempty(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed === undefined || trimmed === '' ? undefined : trimmed
}

function resolveFromCwd(
  path: string,
  cwd: string,
  pathApi: ReturnType<typeof pathForPlatform>,
): string {
  return pathApi.isAbsolute(path) ? pathApi.resolve(path) : pathApi.resolve(cwd, path)
}
