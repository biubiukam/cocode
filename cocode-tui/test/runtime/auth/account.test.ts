import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { deleteAccount, readAccount, writeAccount } from '../../../src/runtime/auth/account.ts'

const homes: string[] = []

async function tempHome(): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), 'cocode-account-'))
  homes.push(home)
  return home
}

afterEach(async () => {
  await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })))
})

describe('account', () => {
  it('round-trips the identity record without exposing inference keys', async () => {
    const home = await tempHome()
    await writeAccount(home, {
      origin: 'https://cocode.agency',
      accessToken: 'access',
      refreshToken: 'refresh',
      accessExpiresAt: 1710000000000,
      personalKeyId: 'key-1',
      personalKeyName: 'Cocode TUI',
    })
    expect(await readAccount(home)).toEqual({
      origin: 'https://cocode.agency',
      accessToken: 'access',
      refreshToken: 'refresh',
      accessExpiresAt: 1710000000000,
      personalKeyId: 'key-1',
      personalKeyName: 'Cocode TUI',
    })
    expect(JSON.stringify(await readAccount(home))).not.toMatch(/ck_|sk-/)
  })

  it('keeps account.yaml and its directory owner-only', async () => {
    const home = await tempHome()
    await writeAccount(home, {
      origin: 'https://cocode.agency',
      accessToken: 'access',
      refreshToken: 'refresh',
      accessExpiresAt: 1710000000000,
    })
    const accountMode = (await stat(join(home, 'account.yaml'))).mode & 0o777
    const directoryMode = (await stat(home)).mode & 0o777
    expect(accountMode).toBe(0o600)
    expect(directoryMode).toBe(0o700)
  })

  it('deletes only account.yaml', async () => {
    const home = await tempHome()
    await writeAccount(home, {
      origin: 'https://cocode.agency',
      accessToken: 'access',
      refreshToken: 'refresh',
      accessExpiresAt: 1710000000000,
    })
    await deleteAccount(home)
    expect(await readAccount(home)).toBeUndefined()
  })
})
