/** Resolve the session-log root shared by the TUI and its child runtime. */

import { homedir as osHomedir } from 'node:os'
import { expandTildePath } from '@cocode/host-supervisor'
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
  /** Explicit DSH home resolved by the Cocode launcher. */
  dshHome?: string
}): SessionRoot {
  const env = options.env ?? process.env
  const pathApi = pathForPlatform(options.platform)
  const cwd = pathApi.resolve(options.cwd ?? process.cwd())
  const homedir = options.homedir ?? osHomedir()
  const configuredRoot = nonempty(env.DSH_SESSION_ROOT)
  if (configuredRoot !== undefined) {
    const candidate = resolveFromCwd(configuredRoot, cwd, homedir, pathApi)
    return { path: candidate, source: 'DSH_SESSION_ROOT' }
  }

  const configuredHome = options.dshHome ?? nonempty(env.DSH_HOME)
  if (configuredHome !== undefined) {
    return {
      path: pathApi.resolve(expandTildePath(configuredHome, homedir), 'sessions'),
      source: 'DSH_HOME',
    }
  }

  return {
    path: pathApi.resolve(homedir, '.dsh', 'sessions'),
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
  homedir: string,
  pathApi: ReturnType<typeof pathForPlatform>,
): string {
  const expanded = expandTildePath(path, homedir)
  return pathApi.isAbsolute(expanded) ? pathApi.resolve(expanded) : pathApi.resolve(cwd, expanded)
}
