import { describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_AGENTS_TEMPLATE, ensureAgentsFile } from '../../../src/runtime/workspace-init.ts'

describe('ensureAgentsFile', () => {
  it('creates a minimal file atomically', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'cocode-init-'))
    try {
      const result = await ensureAgentsFile(cwd)
      expect(result.kind).toBe('created')
      expect(await readFile(join(cwd, 'AGENTS.md'), 'utf8')).toBe(DEFAULT_AGENTS_TEMPLATE)
      expect(await ensureAgentsFile(cwd)).toMatchObject({ kind: 'exists' })
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })

  it('never overwrites an existing file', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'cocode-init-'))
    try {
      await writeFile(join(cwd, 'AGENTS.md'), 'keep\n')
      await ensureAgentsFile(cwd)
      expect(await readFile(join(cwd, 'AGENTS.md'), 'utf8')).toBe('keep\n')
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })
})
