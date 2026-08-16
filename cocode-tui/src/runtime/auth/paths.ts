/** Product home resolution. Tests inject the environment and homedir. */

import { homedir as osHomedir } from 'node:os'
import { join, resolve } from 'node:path'

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
}

export function accountHome(ctx: HomeContext = defaultHomeContext()): string {
  const fromCocode = nonempty(ctx.env.COCODE_HOME)
  if (fromCocode !== undefined) return resolve(fromCocode)
  return join(ctx.homedir, '.cocode')
}

export function dshHome(ctx: HomeContext = defaultHomeContext()): string {
  const fromDsh = nonempty(ctx.env.DSH_HOME)
  if (fromDsh !== undefined) return resolve(fromDsh)
  return join(ctx.homedir, '.dsh')
}

export function productHomes(ctx: HomeContext = defaultHomeContext()): ProductHomes {
  return {
    accountHome: accountHome(ctx),
    dshHome: dshHome(ctx),
  }
}

/** @deprecated Use dshHome for harness files and accountHome for Cocode identity. */
export function productHome(ctx: HomeContext = defaultHomeContext()): string {
  return dshHome(ctx)
}

export function homeDisplay(home: string, ctx: HomeContext = defaultHomeContext()): string {
  if (home === accountHome(ctx)) {
    return nonempty(ctx.env.COCODE_HOME) !== undefined ? '$COCODE_HOME' : '~/.cocode'
  }
  if (home === dshHome(ctx)) {
    return nonempty(ctx.env.DSH_HOME) !== undefined ? '$DSH_HOME' : '~/.dsh'
  }
  return '$DSH_HOME'
}

export function credentialsPath(home: string): string {
  return join(home, '.credentials.yaml')
}

export function settingsPath(home: string): string {
  return join(home, 'settings.yaml')
}

export function accountPath(home: string): string {
  return join(home, 'account.yaml')
}
