import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { patchCredential, readCredentials } from '../../../src/runtime/auth/credentials.ts'

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
    await patchCredential(home, 'COCODE_CLOUD_API_KEY', 'ck_live_two')
    expect(await readCredentials(home)).toEqual({
      DEEPSEEK_API_KEY: 'sk-one',
      COCODE_CLOUD_API_KEY: 'ck_live_two',
    })
    await patchCredential(home, 'COCODE_CLOUD_API_KEY', undefined)
    expect(await readCredentials(home)).toEqual({
      DEEPSEEK_API_KEY: 'sk-one',
    })
  })

  it('writes the document mode 0600', async () => {
    const home = await tempHome()
    await patchCredential(home, 'DEEPSEEK_API_KEY', 'sk-secret')
    const { stat } = await import('node:fs/promises')
    const { mode } = await stat(join(home, '.credentials.yaml'))
    expect(mode & 0o777).toBe(0o600)
  })

  it('does not overwrite a corrupt document', async () => {
    const home = await tempHome()
    const path = join(home, '.credentials.yaml')
    await writeFile(path, '[[[\n', { mode: 0o600 })
    await expect(patchCredential(home, 'DEEPSEEK_API_KEY', 'sk-new')).rejects.toThrow(
      /could not parse/,
    )
    expect(await readFile(path, 'utf8')).toBe('[[[\n')
  })

  it('rejects a corrupt document on read', async () => {
    const home = await tempHome()
    await writeFile(join(home, '.credentials.yaml'), '[[[\n', {
      mode: 0o600,
    })
    await expect(readCredentials(home)).rejects.toThrow(/could not parse/)
  })

  it('rejects empty values and illegal refs', async () => {
    const home = await tempHome()
    await expect(patchCredential(home, 'DEEPSEEK_API_KEY', '  ')).rejects.toThrow(/empty/)
    await expect(patchCredential(home, 'not a ref', 'sk-x')).rejects.toThrow(/ref/)
  })

  it('rejects a world-readable file instead of reading it', async () => {
    const home = await tempHome()
    const path = join(home, '.credentials.yaml')
    await writeFile(path, 'DEEPSEEK_API_KEY: sk-old\n', { mode: 0o644 })
    await expect(patchCredential(home, 'OPENAI_API_KEY', 'sk-new')).rejects.toThrow(/0600/)
  })
})
