import { mkdir, rm, utimes } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { withAccountLock } from '../../../src/runtime/auth/account-lock.ts'
import { accountPath } from '../../../src/runtime/auth/paths.ts'

describe('account lock', () => {
  it('serializes concurrent operations and recovers stale locks', async () => {
    const home = join(tmpdir(), `cocode-lock-${process.pid}-${Date.now()}`)
    await mkdir(home, { recursive: true })
    try {
      const order: string[] = []
      let release!: () => void
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      const first = withAccountLock(home, async () => {
        order.push('first-enter')
        await gate
        order.push('first-exit')
      })
      await new Promise((resolve) => setTimeout(resolve, 20))
      const second = withAccountLock(home, async () => {
        order.push('second-enter')
      })
      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(order).toEqual(['first-enter'])
      release()
      await Promise.all([first, second])
      expect(order).toEqual(['first-enter', 'first-exit', 'second-enter'])

      const stale = `${accountPath(home)}.lock`
      await mkdir(stale)
      const old = new Date(Date.now() - 300_000)
      await utimes(stale, old, old)
      await expect(withAccountLock(home, async () => 'recovered')).resolves.toBe('recovered')
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })
})
