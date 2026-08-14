/** Resolve the session-log root shared by the TUI and its child runtime. */

import { isAbsolute, resolve } from 'node:path'

export type SessionRootSource = 'DSH_SESSION_ROOT' | 'productHome'

export type SessionRoot = {
  path: string
  source: SessionRootSource
}

export function resolveSessionRoot(options: {
  env?: NodeJS.ProcessEnv
  productHome: string
  cwd?: string
}): SessionRoot {
  const env = options.env ?? process.env
  const cwd = resolve(options.cwd ?? process.cwd())
  const configured = env.DSH_SESSION_ROOT?.trim()
  if (configured !== undefined && configured !== '') {
    return {
      path: isAbsolute(configured) ? resolve(configured) : resolve(cwd, configured),
      source: 'DSH_SESSION_ROOT',
    }
  }
  return { path: resolve(options.productHome, 'sessions'), source: 'productHome' }
}
