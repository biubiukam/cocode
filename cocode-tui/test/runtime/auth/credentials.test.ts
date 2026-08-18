import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { patchCredential, readCredentials } from '../../../src/runtime/auth/credentials.ts'
import { credentialsPath } from '../../../src/runtime/auth/paths.ts'

const homes: string[] = []

async function tempHome(): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), 'cocode-auth-'))
  homes.push(home)
  return home
}

afterEach(async () => {
  await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })))
})

describe('credentials', () => {
  it('returns an empty map when the file is missing', async () => {
    const home = await tempHome()
    expect(await readCredentials(home)).toEqual({})
  })

  it('patches one ref without dropping others', async () => {
    const home = await tempHome()
    await patchCredential(home, 'DEEPSEEK_API_KEY', 'sk-one')
    await patchCredential(home, 'COCODE_NUT_API_KEY', 'ck_live_two')
    expect(await readCredentials(home)).toEqual({
      DEEPSEEK_API_KEY: 'sk-one',
      COCODE_NUT_API_KEY: 'ck_live_two',
    })
    await patchCredential(home, 'COCODE_NUT_API_KEY', undefined)
    expect(await readCredentials(home)).toEqual({
      DEEPSEEK_API_KEY: 'sk-one',
    })
  })

  it.runIf(process.platform !== 'win32')('writes the document mode 0600', async () => {
    const home = await tempHome()
    await patchCredential(home, 'DEEPSEEK_API_KEY', 'sk-secret')
    const { stat } = await import('node:fs/promises')
    const { mode } = await stat(credentialsPath(home))
    expect(mode & 0o777).toBe(0o600)
  })

  it('does not overwrite a corrupt document', async () => {
    const home = await tempHome()
    const path = credentialsPath(home)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, '[[[\n', { mode: 0o600 })
    await expect(patchCredential(home, 'DEEPSEEK_API_KEY', 'sk-new')).rejects.toThrow(/IO_PARSE/)
    expect(await readFile(path, 'utf8')).toBe('[[[\n')
  })

  it('rejects a corrupt document on read', async () => {
    const home = await tempHome()
    const path = credentialsPath(home)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, '[[[\n', {
      mode: 0o600,
    })
    await expect(readCredentials(home)).rejects.toThrow(/IO_PARSE/)
  })

  it('rejects empty values and illegal refs', async () => {
    const home = await tempHome()
    await expect(patchCredential(home, 'DEEPSEEK_API_KEY', '  ')).rejects.toThrow(
      /AUTH_CREDENTIAL_EMPTY/,
    )
    await expect(patchCredential(home, 'not a ref', 'sk-x')).rejects.toThrow(/AUTH_CREDENTIAL_REF/)
  })

  it.runIf(process.platform !== 'win32')(
    'rejects a world-readable file instead of reading it',
    async () => {
      const home = await tempHome()
      const path = credentialsPath(home)
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, 'DEEPSEEK_API_KEY: sk-old\n', { mode: 0o644 })
      await expect(patchCredential(home, 'OPENAI_API_KEY', 'sk-new')).rejects.toThrow(/IO_MODE/)
    },
  )
})
