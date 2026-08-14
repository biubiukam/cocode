import { describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildPromptBlocks, loadFileContext } from '../../../src/runtime/file-context.ts'

describe('file context', () => {
  it('loads UTF-8 text and creates one separated text block', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'cocode-context-'))
    try {
      await writeFile(join(cwd, 'a.ts'), 'const x = 1;\n')
      const files = await loadFileContext({ cwd, paths: ['a.ts'] })
      expect(files[0]).toMatchObject({ path: 'a.ts', text: 'const x = 1;\n' })
      const blocks = buildPromptBlocks('review', files)
      expect(blocks).toHaveLength(1)
      expect(blocks[0]?.text).toContain('[Attached file: a.ts]')
      expect(blocks[0]?.text).toContain('review\n\n')
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })

  it('rejects binary and outside symlink paths', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'cocode-context-'))
    const outside = await mkdtemp(join(tmpdir(), 'cocode-outside-'))
    try {
      await writeFile(join(cwd, 'binary.bin'), Buffer.from([0, 1, 2]))
      await writeFile(join(outside, 'secret.txt'), 'secret\n')
      await symlink(join(outside, 'secret.txt'), join(cwd, 'link.txt'))
      await expect(loadFileContext({ cwd, paths: ['binary.bin'] })).rejects.toThrow(/binary/)
      await expect(loadFileContext({ cwd, paths: ['link.txt'] })).rejects.toThrow(/outside/)
    } finally {
      await rm(cwd, { recursive: true, force: true })
      await rm(outside, { recursive: true, force: true })
    }
  })

  it('attaches a bounded directory listing', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'cocode-context-dir-'))
    try {
      await mkdir(join(cwd, 'src'))
      await writeFile(join(cwd, 'README.md'), 'readme\n')
      const contexts = await loadFileContext({ cwd, paths: ['.'], maxDirectoryEntries: 2 })
      expect(contexts[0]).toMatchObject({ kind: 'directory', path: '.' })
      const blocks = buildPromptBlocks('inspect', contexts)
      expect(blocks[0]?.text).toContain('[Attached directory: .]')
      expect(blocks[0]?.text).toContain('src/')
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })
})
