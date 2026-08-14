/** Read lightweight session metadata without owning persistence semantics. */

import { createReadStream } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { createZstdDecompress } from 'node:zlib'
import { join, posix, resolve, win32 } from 'node:path'

export type SessionSummary = {
  id: string
  createdAt: number
  cwd?: string
  path: string
}

export type SessionListResult = {
  sessions: SessionSummary[]
  skipped: number
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
        sessions.push({ ...header, path: existing[0] })
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
