import { describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zstdCompressSync } from 'node:zlib'
import {
  listSessionSummaries,
  readSessionEvents,
  samePath,
} from '../../../src/runtime/sessions-fs.ts'

describe('listSessionSummaries', () => {
  it('compares Windows paths case-insensitively', () => {
    expect(samePath('C:\\Work\\Project', 'c:\\work\\project', 'win32')).toBe(true)
    expect(samePath('/work/Project', '/work/project', 'linux')).toBe(false)
  })

  it('reads raw and zstd headers for the selected cwd', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cocode-session-list-'))
    const cwd = '/work/project'
    try {
      await writeSession(
        root,
        'project-a',
        's1',
        JSON.stringify({
          type: 'session',
          version: 0,
          id: 's1',
          createdAt: 10,
          cwd,
        }) + '\n',
      )
      await writeSession(
        root,
        'project-b',
        's2',
        zstdCompressSync(
          Buffer.from(
            JSON.stringify({
              type: 'session',
              version: 0,
              id: 's2',
              createdAt: 20,
              cwd,
            }) + '\n',
          ),
        ),
      )
      await writeSession(
        root,
        'project-c',
        'other',
        JSON.stringify({
          type: 'session',
          version: 0,
          id: 'other',
          createdAt: 30,
          cwd: '/other',
        }) + '\n',
      )
      const result = await listSessionSummaries({ root, cwd })
      expect(result.sessions.map((session) => session.id)).toEqual(['s2', 's1'])
      expect(result.sessions[0]?.path.endsWith('session.jsonl.zstd')).toBe(true)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('skips malformed and mixed-encoding artifacts', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cocode-session-list-'))
    try {
      await writeSession(root, 'bad', 'bad', 'not json\n')
      const mixed = join(root, 'mixed', 's3')
      await mkdir(mixed, { recursive: true })
      await writeFile(join(mixed, 'session.jsonl'), '{}\n')
      await writeFile(join(mixed, 'session.jsonl.zstd'), Buffer.from('bad'))
      const result = await listSessionSummaries({ root, cwd: '/work/project' })
      expect(result.sessions).toEqual([])
      expect(result.skipped).toBeGreaterThanOrEqual(2)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('returns an empty list for a missing root', async () => {
    const result = await listSessionSummaries({ root: '/tmp/no-such-cocode-root', cwd: '/work' })
    expect(result).toEqual({ sessions: [], skipped: 0 })
  })

  it('replays raw and zstd event logs without returning the session header', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cocode-session-read-'))
    const event = JSON.stringify({
      type: 'user/message',
      seq: 1,
      time: 2,
      data: { id: 'u1', content: [{ type: 'text', text: 'hello' }] },
    })
    try {
      await writeSession(
        root,
        'raw',
        's1',
        `${JSON.stringify({ type: 'session', id: 's1', createdAt: 1 })}\n${event}\n`,
      )
      await writeSession(
        root,
        'zstd',
        's2',
        zstdCompressSync(
          Buffer.from(`${JSON.stringify({ type: 'session', id: 's2', createdAt: 1 })}\n${event}\n`),
        ),
      )
      const raw = await readSessionEvents(join(root, 'raw', 's1', 'session.jsonl'))
      const compressed = await readSessionEvents(join(root, 'zstd', 's2', 'session.jsonl.zstd'))
      expect(raw).toEqual(compressed)
      expect(raw).toEqual([
        {
          type: 'user/message',
          seq: 1,
          time: 2,
          data: { id: 'u1', content: [{ type: 'text', text: 'hello' }] },
        },
      ])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

async function writeSession(
  root: string,
  project: string,
  id: string,
  content: string | Buffer,
): Promise<void> {
  const dir = join(root, project, id)
  await mkdir(dir, { recursive: true })
  await writeFile(
    join(dir, typeof content === 'string' ? 'session.jsonl' : 'session.jsonl.zstd'),
    content,
  )
}
