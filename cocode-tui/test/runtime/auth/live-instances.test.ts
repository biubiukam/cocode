import { mkdtemp, readdir, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  otherLiveCount,
  registerLiveInstance,
  releaseLiveInstance,
  isProcessAlive,
  type LiveInstanceContext,
} from '../../../src/runtime/auth/live-instances.ts'

const homes: string[] = []

async function tempHome(): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), 'cocode-live-'))
  homes.push(home)
  return home
}

afterEach(async () => {
  await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })))
})

function ctx(pid: number, alive: readonly number[]): LiveInstanceContext {
  const live = new Set(alive)
  return {
    pid,
    isAlive: (candidate) => live.has(candidate),
  }
}

describe('live TUI instances', () => {
  it('treats EPERM as a live process', () => {
    const error = Object.assign(new Error('permission denied'), { code: 'EPERM' })
    expect(
      isProcessAlive(42, () => {
        throw error
      }),
    ).toBe(true)
  })

  it('does not count the current process as another instance', async () => {
    const home = await tempHome()
    const self = ctx(42, [42])
    await registerLiveInstance(home, self)
    expect(await otherLiveCount(home, self)).toBe(0)
  })

  it('counts another live pid sharing the home', async () => {
    const home = await tempHome()
    await registerLiveInstance(home, ctx(42, [42]))
    expect(await otherLiveCount(home, ctx(99, [42, 99]))).toBe(1)
  })

  it('ignores stale pid files after the process is gone', async () => {
    const home = await tempHome()
    await registerLiveInstance(home, ctx(42, [42]))
    expect(await otherLiveCount(home, ctx(99, [99]))).toBe(0)
    const leftover = await readdir(join(home, '.tui-live'))
    expect(leftover).not.toContain('42')
  })

  it('release removes this process marker', async () => {
    const home = await tempHome()
    const self = ctx(42, [42])
    await registerLiveInstance(home, self)
    await releaseLiveInstance(home, self)
    const names = await readdir(join(home, '.tui-live')).catch(() => [])
    expect(names).not.toContain('42')
  })

  it('skips non-pid junk in the live directory', async () => {
    const home = await tempHome()
    await mkdir(join(home, '.tui-live'), { recursive: true, mode: 0o700 })
    await writeFile(join(home, '.tui-live', 'readme'), 'nope')
    expect(await otherLiveCount(home, ctx(99, [99]))).toBe(0)
  })
})
