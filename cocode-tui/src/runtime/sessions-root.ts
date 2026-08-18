/** Resolve the session-log root shared by the TUI and its child runtime. */

import { homedir as osHomedir } from 'node:os'
import { expandTildePath } from '@cocode/host-supervisor'
import { pathForPlatform } from './platform.ts'

export type SessionRootSource = 'DSH_SESSION_ROOT' | 'COCODE_HOME' | 'default'

export type SessionRoot = {
  path: string
  source: SessionRootSource
}

export function resolveSessionRoot(options: {
  env?: NodeJS.ProcessEnv
  cwd?: string
  homedir?: string
  platform?: NodeJS.Platform
  /** When set, explicit overrides are accepted only below this Cocode home. */
  runtimeHome?: string
}): SessionRoot {
  const env = options.env ?? process.env
  const pathApi = pathForPlatform(options.platform)
  const cwd = pathApi.resolve(options.cwd ?? process.cwd())
  const homedir = options.homedir ?? osHomedir()
  const configuredRoot = nonempty(env.DSH_SESSION_ROOT)
  if (configuredRoot !== undefined) {
    const candidate = resolveFromCwd(configuredRoot, cwd, homedir, pathApi)
    if (options.runtimeHome === undefined || isWithin(
      candidate,
      pathApi.resolve(expandTildePath(options.runtimeHome, homedir), 'sessions'),
      pathApi,
    )) {
      return { path: candidate, source: 'DSH_SESSION_ROOT' }
    }

    // The embedded Cocode runtime must never fall back to an ambient
    // official DSH session root. Once its home is known, keep the child
    // runtime inside that home even when DSH_SESSION_ROOT points elsewhere.
    return {
      path: pathApi.resolve(expandTildePath(options.runtimeHome, homedir), 'sessions'),
      source: 'COCODE_HOME',
    }
  }

  const configuredHome = nonempty(env.COCODE_HOME)
  if (configuredHome !== undefined) {
    return {
      path: pathApi.resolve(expandTildePath(configuredHome, homedir), 'sessions'),
      source: 'COCODE_HOME',
    }
  }

  return {
    path: pathApi.resolve(homedir, '.cocode', 'sessions'),
    source: 'default',
  }
}

function isWithin(target: string, root: string, pathApi: ReturnType<typeof pathForPlatform>): boolean {
  const relative = pathApi.relative(pathApi.resolve(root), pathApi.resolve(target))
  return relative === '' || (!pathApi.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${pathApi.sep}`))
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
