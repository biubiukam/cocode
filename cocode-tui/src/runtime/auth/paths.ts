/**
 * Product home resolution. Tests inject homedir and exists.
 */

import { existsSync } from 'node:fs'
import { homedir as osHomedir } from 'node:os'
import { join, resolve } from 'node:path'

const MARKERS = ['settings.yaml', 'config.yaml', '.credentials.yaml'] as const

export type HomeContext = {
  env: NodeJS.ProcessEnv
  homedir: string
  exists: (path: string) => boolean
}

export function defaultHomeContext(env: NodeJS.ProcessEnv = process.env): HomeContext {
  return { env, homedir: osHomedir(), exists: existsSync }
}

function nonempty(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed === undefined || trimmed === '' ? undefined : trimmed
}

function hasMarkers(home: string, exists: (path: string) => boolean): boolean {
  return MARKERS.some((name) => exists(join(home, name)))
}

export function productHome(ctx: HomeContext = defaultHomeContext()): string {
  const fromCocode = nonempty(ctx.env.COCODE_HOME)
  if (fromCocode !== undefined) return resolve(fromCocode)
  const fromDsh = nonempty(ctx.env.DSH_HOME)
  if (fromDsh !== undefined) return resolve(fromDsh)
  const cocode = join(ctx.homedir, '.cocode')
  if (hasMarkers(cocode, ctx.exists)) return cocode
  const dsh = join(ctx.homedir, '.dsh')
  if (ctx.exists(dsh)) return dsh
  return cocode
}

export function homeDisplay(home: string, ctx: HomeContext = defaultHomeContext()): string {
  if (nonempty(ctx.env.COCODE_HOME) !== undefined) return '$COCODE_HOME'
  if (nonempty(ctx.env.DSH_HOME) !== undefined) return '$DSH_HOME'
  if (home === join(ctx.homedir, '.cocode')) return '~/.cocode'
  if (home === join(ctx.homedir, '.dsh')) return '~/.dsh'
  return '$COCODE_HOME'
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
