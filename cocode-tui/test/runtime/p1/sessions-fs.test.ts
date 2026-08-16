import { describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zstdCompressSync } from 'node:zlib'
import {
  listSessionSummaries,
  readSessionEvents,
  replaySessionEvents,
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
        `${JSON.stringify({
          type: 'session',
          version: 0,
          id: 's1',
          createdAt: 10,
          cwd,
        })}\n${JSON.stringify({
          type: 'user/message',
          seq: 1,
          time: 11,
          data: { content: [{ type: 'text', text: 'Fix the resume picker summary' }] },
        })}\n`,
      )
      await writeSession(
        root,
        'project-b',
        's2',
        zstdCompressSync(
          Buffer.from(
            `${JSON.stringify({
              type: 'session',
              version: 0,
              id: 's2',
              createdAt: 20,
              cwd,
              parentSession: 's1',
              seedLength: 2,
            })}\n${JSON.stringify({
              type: 'user/message',
              seq: 1,
              time: 21,
              data: {
                content: [
                  {
                    type: 'text',
                    text: 'A compressed session with a first prompt summary',
                  },
                ],
              },
            })}\n`,
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
      expect(result.sessions[0]).toMatchObject({ parentSession: 's1', seedLength: 2 })
      expect(result.sessions.map((session) => session.updatedAt)).toEqual([21, 11])
      expect(result.sessions.map((session) => session.preview)).toEqual([
        'A compressed session with a first prompt summary',
        'Fix the resume picker summary',
      ])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('skips injected context when choosing the session preview', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cocode-session-context-preview-'))
    const cwd = '/work/project'
    try {
      await writeSession(
        root,
        'project',
        's1',
        `${JSON.stringify({ type: 'session', id: 's1', createdAt: 1, cwd })}\n${JSON.stringify({
          type: 'user/message',
          seq: 1,
          time: 2,
          data: {
            content: [{ type: 'text', text: 'Current runtime context.' }],
            source: { kind: 'plugin', plugin: '@deepseek-ai/dsh-system-prompt' },
          },
        })}\n${JSON.stringify({
          type: 'user/message',
          seq: 2,
          time: 3,
          data: {
            content: [{ type: 'text', text: 'The actual user prompt' }],
            source: { kind: 'user' },
          },
        })}\n`,
      )
      const result = await listSessionSummaries({ root, cwd })
      expect(result.sessions[0]?.preview).toBe('The actual user prompt')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('uses original user content for the session preview', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cocode-session-display-content-'))
    const cwd = '/work/project'
    try {
      await writeSession(
        root,
        'project',
        's1',
        `${JSON.stringify({ type: 'session', id: 's1', createdAt: 1, cwd })}\n${JSON.stringify({
          type: 'user/message',
          seq: 1,
          time: 2,
          data: {
            content: [{ type: 'text', text: '[Image evidence]\na diagram' }],
            source: {
              kind: 'user',
              displayContent: [{ type: 'text', text: 'What is in this image?' }, { type: 'image' }],
            },
          },
        })}\n`,
      )
      const result = await listSessionSummaries({ root, cwd })
      expect(result.sessions[0]?.preview).toBe('What is in this image?')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('removes legacy image evidence from the session preview', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cocode-session-legacy-evidence-'))
    const cwd = '/work/project'
    try {
      await writeSession(
        root,
        'project',
        's1',
        `${JSON.stringify({ type: 'session', id: 's1', createdAt: 1, cwd })}\n${JSON.stringify({
          type: 'user/message',
          seq: 1,
          time: 2,
          data: {
            content: [
              { type: 'text', text: 'What is in this image?' },
              { type: 'text', text: '[Image evidence]\na diagram' },
            ],
            source: { kind: 'user' },
          },
        })}\n`,
      )
      const result = await listSessionSummaries({ root, cwd })
      expect(result.sessions[0]?.preview).toBe('What is in this image?')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('uses the latest sanitized session title for display metadata', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cocode-session-title-'))
    const cwd = '/work/project'
    try {
      await writeSession(
        root,
        'project',
        's1',
        `${JSON.stringify({ type: 'session', id: 's1', createdAt: 1, cwd })}\n${JSON.stringify({
          type: 'session/title',
          seq: 1,
          time: 2,
          data: { title: 'First title' },
        })}\n${JSON.stringify({
          type: 'session/title',
          seq: 2,
          time: 3,
          data: { title: '\u001b[31mLatest\u001b[0m title' },
        })}\n`,
      )
      const result = await listSessionSummaries({ root, cwd })
      expect(result.sessions[0]?.title).toBe('Latest title')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('sorts by the latest event time instead of creation time', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cocode-session-activity-'))
    const cwd = '/work/project'
    try {
      await writeSession(
        root,
        'old-active',
        'old-active',
        `${JSON.stringify({ type: 'session', id: 'old-active', createdAt: 1, cwd })}\n${JSON.stringify({
          type: 'user/message',
          seq: 1,
          time: 100,
          data: { content: [{ type: 'text', text: 'recent activity' }] },
        })}\n`,
      )
      await writeSession(
        root,
        'new-idle',
        'new-idle',
        `${JSON.stringify({ type: 'session', id: 'new-idle', createdAt: 90, cwd })}\n`,
      )

      const result = await listSessionSummaries({ root, cwd })
      expect(result.sessions.map((session) => session.id)).toEqual(['old-active', 'new-idle'])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('sanitizes and bounds the first user prompt preview', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cocode-session-list-'))
    const cwd = '/work/project'
    const prompt = `\u001b[31m${'界'.repeat(80)}\u001b[0m\nnext line`
    try {
      await writeSession(
        root,
        'project',
        's1',
        `${JSON.stringify({ type: 'session', id: 's1', createdAt: 1, cwd })}\n${JSON.stringify({
          type: 'user/message',
          seq: 1,
          time: 2,
          data: { content: [{ type: 'text', text: prompt }] },
        })}\n`,
      )
      const result = await listSessionSummaries({ root, cwd })
      const preview = result.sessions[0]?.preview
      expect(preview).toBe(`${'界'.repeat(71)}…`)
      expect(Array.from(preview ?? '')).toHaveLength(72)
      expect(preview).not.toMatch(/[\u0000-\u001f\u007f-\u009f]/)
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
      const streamed: string[] = []
      const count = await replaySessionEvents(
        join(root, 'zstd', 's2', 'session.jsonl.zstd'),
        (next) => streamed.push(next.type),
      )
      expect(count).toBe(1)
      expect(streamed).toEqual(['user/message'])
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
