import { describe, expect, it } from 'vitest'
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { editDraft, parseEditorCommand } from '../../../src/runtime/external-editor.ts'
import { searchHistory } from '../../../src/runtime/history-search.ts'

describe('history search', () => {
  it('returns recent unique matches', () => {
    expect(searchHistory(['one', 'two', 'one', 'three'], 'o')).toEqual(['one', 'two'])
  })
})

describe('external editor', () => {
  it('parses quoted commands and returns edited text', async () => {
    expect(parseEditorCommand('code --wait "draft file"')).toEqual(['code', '--wait', 'draft file'])
    let editedPath = ''
    const parent = await mkdtemp(join(tmpdir(), 'cocode-editor-'))
    try {
      const result = await editDraft({
        text: 'before',
        env: { EDITOR: 'fake-editor --wait' },
        tempParent: parent,
        runner: async (_command, args, filePath) => {
          editedPath = filePath
          expect(args).toEqual(['--wait'])
          await writeFile(filePath, 'after\n', 'utf8')
          return 0
        },
      })
      expect(result).toBe('after\n')
      await expect(access(editedPath)).rejects.toThrow()
    } finally {
      await rm(parent, { recursive: true, force: true })
    }
  })

  it('reports missing editor configuration', async () => {
    await expect(editDraft({ text: 'x', env: {} })).rejects.toThrow(/VISUAL|EDITOR/)
  })
})
