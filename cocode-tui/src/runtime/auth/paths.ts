/** Product home resolution. Tests inject the environment and homedir. */

import { homedir as osHomedir } from 'node:os'
import { join } from 'node:path'
import { resolveUserPath } from '@cocode/host-supervisor'

export type HomeContext = {
  env: NodeJS.ProcessEnv
  homedir: string
}

export function defaultHomeContext(env: NodeJS.ProcessEnv = process.env): HomeContext {
  return { env, homedir: osHomedir() }
}

function nonempty(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed === undefined || trimmed === '' ? undefined : trimmed
}

export type ProductHomes = {
  accountHome: string
  dshHome: string
  sharedDshHome: string
}

export function accountHome(ctx: HomeContext = defaultHomeContext()): string {
  const fromCocode = nonempty(ctx.env.COCODE_HOME)
  if (fromCocode !== undefined) return resolveUserPath(fromCocode, ctx.homedir)
  return join(ctx.homedir, '.cocode')
}

/** Cocode-owned settings/credentials home; ambient official DSH_HOME is ignored. */
export function dshHome(ctx: HomeContext = defaultHomeContext()): string {
  const fromCocode = nonempty(ctx.env.COCODE_HOME)
  if (fromCocode !== undefined) return resolveUserPath(fromCocode, ctx.homedir)
  return join(ctx.homedir, '.cocode')
}

/** Shared DSH data home used by the Cocode and official web profiles. */
export function sharedDshHome(ctx: HomeContext = defaultHomeContext()): string {
  const configured = nonempty(ctx.env.COCODE_DSH_HOME)
  return resolveUserPath(configured ?? join(ctx.homedir, '.dsh'), ctx.homedir)
}

export function productHomes(ctx: HomeContext = defaultHomeContext()): ProductHomes {
  return {
    accountHome: accountHome(ctx),
    dshHome: dshHome(ctx),
    sharedDshHome: sharedDshHome(ctx),
  }
}

/** @deprecated Use dshHome for Cocode settings and accountHome for identity. */
export function productHome(ctx: HomeContext = defaultHomeContext()): string {
  return dshHome(ctx)
}

export function homeDisplay(home: string, ctx: HomeContext = defaultHomeContext()): string {
  if (home === accountHome(ctx)) {
    return nonempty(ctx.env.COCODE_HOME) !== undefined ? '$COCODE_HOME' : '~/.cocode'
  }
  if (home === dshHome(ctx)) {
    return nonempty(ctx.env.COCODE_HOME) !== undefined ? '$COCODE_HOME' : '~/.cocode'
  }
  if (home === sharedDshHome(ctx)) {
    return nonempty(ctx.env.COCODE_DSH_HOME) !== undefined ? '$COCODE_DSH_HOME' : '~/.dsh'
  }
  return '$COCODE_HOME'
}

export function credentialsPath(home: string): string {
  return join(home, 'credentials', 'credentials.yaml')
}

export function settingsPath(home: string): string {
  return join(home, 'settings', 'settings.yaml')
}

export function accountPath(home: string): string {
  return join(home, 'account.yaml')
}
