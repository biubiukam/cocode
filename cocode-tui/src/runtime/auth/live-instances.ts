/**
 * Track live TUI processes that share a product home.
 */

import { unlinkSync } from 'node:fs'
import { mkdir, readdir, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { TuiError } from '../errors/index.ts'

export const LIVE_DIR = '.tui-live'

export class HomeBusyError extends TuiError {
  constructor() {
    super('AUTH_HOME_BUSY')
    this.name = 'HomeBusyError'
  }
}

export type LiveInstanceContext = {
  pid: number
  isAlive: (pid: number) => boolean
}

export const defaultLiveContext: LiveInstanceContext = {
  pid: process.pid,
  isAlive: isProcessAlive,
}

export async function registerLiveInstance(
  home: string,
  ctx: LiveInstanceContext = defaultLiveContext,
): Promise<void> {
  const dir = liveDir(home)
  await mkdir(dir, { recursive: true, mode: 0o700 })
  await sweepStale(dir, ctx)
  await writeFile(join(dir, String(ctx.pid)), `${ctx.pid}\n`, { mode: 0o600 })
}

export async function releaseLiveInstance(
  home: string,
  ctx: LiveInstanceContext = defaultLiveContext,
): Promise<void> {
  await unlink(join(liveDir(home), String(ctx.pid))).catch(() => undefined)
}

export function releaseLiveInstanceSync(
  home: string,
  ctx: LiveInstanceContext = defaultLiveContext,
): void {
  try {
    unlinkSync(join(liveDir(home), String(ctx.pid)))
  } catch {
    // Best-effort cleanup on process exit.
  }
}

export async function otherLiveCount(
  home: string,
  ctx: LiveInstanceContext = defaultLiveContext,
): Promise<number> {
  const dir = liveDir(home)
  const pids = await sweepStale(dir, ctx)
  return pids.filter((pid) => pid !== ctx.pid).length
}

function liveDir(home: string): string {
  return join(home, LIVE_DIR)
}

async function sweepStale(dir: string, ctx: LiveInstanceContext): Promise<number[]> {
  let names: string[]
  try {
    names = await readdir(dir)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
  const live: number[] = []
  for (const name of names) {
    if (!/^\d+$/.test(name)) continue
    const pid = Number(name)
    if (!ctx.isAlive(pid)) {
      await unlink(join(dir, name)).catch(() => undefined)
      continue
    }
    live.push(pid)
  }
  return live
}

export function isProcessAlive(pid: number, kill: typeof process.kill = process.kill): boolean {
  try {
    kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException | undefined)?.code === 'EPERM'
  }
}
