/** Read lightweight session metadata without owning persistence semantics. */

import { createReadStream } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { createZstdDecompress } from 'node:zlib'
import { join, posix, resolve, win32 } from 'node:path'
import type { SessionEvent } from '@cocode/tui-connection'
import { blocksToText, isRecord } from './text.ts'

export const SESSION_PREVIEW_MAX_LENGTH = 72

export type SessionSummary = {
  id: string
  createdAt: number
  cwd?: string
  preview?: string
  path: string
}

export type SessionListResult = {
  sessions: SessionSummary[]
  skipped: number
}

export async function readSessionEvents(path: string): Promise<SessionEvent[]> {
  const events: SessionEvent[] = []
  await replaySessionEvents(path, (event) => events.push(event))
  return events
}

export async function replaySessionEvents(
  path: string,
  onEvent: (event: SessionEvent) => void,
): Promise<number> {
  const compressed = path.endsWith('.zstd')
  const source = createReadStream(path)
  const output = compressed ? source.pipe(createZstdDecompress()) : source
  const lines = createInterface({ input: output })
  let count = 0
  try {
    for await (const line of lines) {
      const event = parseEvent(line)
      if (event === undefined) continue
      onEvent(event)
      count += 1
    }
  } finally {
    lines.close()
    source.destroy()
    if (compressed) output.destroy()
  }
  return count
}

type SessionHeader = {
  type: 'session'
  id: string
  createdAt: number
  cwd?: string
}

export async function listSessionSummaries(options: {
  root: string
  cwd: string
  limit?: number
  signal?: AbortSignal
}): Promise<SessionListResult> {
  const root = resolve(options.root)
  const targetCwd = resolve(options.cwd)
  const sessions: SessionSummary[] = []
  let skipped = 0

  let projects: import('node:fs').Dirent[]
  try {
    projects = await readdir(root, { withFileTypes: true })
  } catch (error) {
    if (isNotFound(error)) return { sessions: [], skipped: 0 }
    throw error
  }

  for (const project of projects) {
    options.signal?.throwIfAborted()
    if (!project.isDirectory()) continue
    let entries: import('node:fs').Dirent[]
    try {
      entries = await readdir(join(root, project.name), { withFileTypes: true })
    } catch {
      skipped += 1
      continue
    }
    for (const entry of entries) {
      options.signal?.throwIfAborted()
      if (!entry.isDirectory()) continue
      const dir = join(root, project.name, entry.name)
      const plain = join(dir, 'session.jsonl')
      const compressed = join(dir, 'session.jsonl.zstd')
      const candidates = [plain, compressed]
      let existing: string[]
      try {
        existing = await existingFiles(candidates)
      } catch {
        skipped += 1
        continue
      }
      if (existing.length !== 1) {
        if (existing.length > 1) skipped += 1
        continue
      }
      try {
        const line = await readFirstLine(existing[0], existing[0] === compressed)
        const header = line === undefined ? undefined : parseHeader(line)
        if (header === undefined || header.cwd === undefined || !samePath(header.cwd, targetCwd)) {
          skipped += 1
          continue
        }
        let preview: string | undefined
        try {
          preview = await readFirstUserPreview(existing[0], existing[0] === compressed)
        } catch {
          // A broken or partially-written event stream must not hide a valid session header.
        }
        sessions.push({
          ...header,
          ...(preview === undefined ? {} : { preview }),
          path: existing[0],
        })
      } catch {
        skipped += 1
      }
    }
  }

  sessions.sort(
    (left, right) => right.createdAt - left.createdAt || left.id.localeCompare(right.id),
  )
  const limit = options.limit === undefined ? sessions.length : Math.max(0, options.limit)
  return { sessions: sessions.slice(0, limit), skipped }
}

async function readFirstUserPreview(
  path: string,
  compressed: boolean,
): Promise<string | undefined> {
  const source = createReadStream(path)
  const output = compressed ? source.pipe(createZstdDecompress()) : source
  const lines = createInterface({ input: output })
  try {
    for await (const line of lines) {
      const event = parseEvent(line)
      if (event?.type !== 'user/message') continue
      return previewText(userMessageText(event.data))
    }
    return undefined
  } finally {
    lines.close()
    source.destroy()
    if (compressed) output.destroy()
  }
}

function userMessageText(data: unknown): string {
  if (!isRecord(data)) return ''
  if ('content' in data) return blocksToText(data.content)
  const message = isRecord(data.message) ? data.message : undefined
  return message === undefined ? '' : blocksToText(message.content)
}

function previewText(value: string): string | undefined {
  const normalized = value
    // eslint-disable-next-line no-control-regex
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (normalized === '') return undefined
  const characters = Array.from(normalized)
  if (characters.length <= SESSION_PREVIEW_MAX_LENGTH) return normalized
  return `${characters.slice(0, SESSION_PREVIEW_MAX_LENGTH - 1).join('')}…`
}

async function existingFiles(paths: string[]): Promise<string[]> {
  const found: string[] = []
  for (const path of paths) {
    try {
      const info = await stat(path)
      if (info.isFile()) found.push(path)
    } catch (error) {
      if (!isNotFound(error)) throw error
    }
  }
  return found
}

async function readFirstLine(path: string, compressed: boolean): Promise<string | undefined> {
  const source = createReadStream(path)
  const output = compressed ? source.pipe(createZstdDecompress()) : source
  return new Promise((resolveLine, reject) => {
    let settled = false
    let buffer = ''
    const finish = (error: Error | undefined, line?: string): void => {
      if (settled) return
      settled = true
      source.destroy()
      if (compressed) output.destroy()
      if (error !== undefined) reject(error)
      else resolveLine(line)
    }
    output.on('data', (chunk: Buffer | string) => {
      buffer += chunk.toString()
      const newline = buffer.indexOf('\n')
      if (newline >= 0) finish(undefined, buffer.slice(0, newline))
    })
    output.once('end', () => finish(undefined))
    output.once('error', (error: Error) => finish(error))
    source.once('error', (error: Error) => finish(error))
  })
}

function parseHeader(line: string): SessionHeader | undefined {
  let value: unknown
  try {
    value = JSON.parse(line)
  } catch {
    return undefined
  }
  if (typeof value !== 'object' || value === null) return undefined
  const record = value as Record<string, unknown>
  if (
    record.type !== 'session' ||
    typeof record.id !== 'string' ||
    typeof record.createdAt !== 'number' ||
    !Number.isSafeInteger(record.createdAt) ||
    record.createdAt < 0 ||
    (record.cwd !== undefined && typeof record.cwd !== 'string')
  ) {
    return undefined
  }
  return {
    type: 'session',
    id: record.id,
    createdAt: record.createdAt,
    ...(record.cwd === undefined ? {} : { cwd: record.cwd }),
  }
}

function parseEvent(line: string): SessionEvent | undefined {
  let value: unknown
  try {
    value = JSON.parse(line)
  } catch {
    return undefined
  }
  if (typeof value !== 'object' || value === null) return undefined
  const record = value as Record<string, unknown>
  if (
    typeof record.type !== 'string' ||
    record.type === 'session' ||
    typeof record.seq !== 'number' ||
    !Number.isSafeInteger(record.seq) ||
    typeof record.time !== 'number' ||
    !Number.isFinite(record.time) ||
    !('data' in record)
  ) {
    return undefined
  }
  return {
    type: record.type,
    seq: record.seq,
    time: record.time,
    data: record.data,
    ...(record.ignorable === true ? { ignorable: true } : {}),
  }
}

function isNotFound(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT'
}

export function samePath(
  left: string,
  right: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  const pathApi = platform === 'win32' ? win32 : posix
  const leftPath = pathApi.resolve(left)
  const rightPath = pathApi.resolve(right)
  return platform === 'win32'
    ? leftPath.toLowerCase() === rightPath.toLowerCase()
    : leftPath === rightPath
}
