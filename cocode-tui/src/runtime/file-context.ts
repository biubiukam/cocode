/** Load safe workspace file attachments and format them as prompt text. */

import { readFile, readdir, realpath, stat } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import type { ContentBlock } from '@cocode/tui-connection'
import { pathForPlatform } from './platform.ts'

export type FileContext =
  | { kind: 'file'; path: string; text: string; bytes: number }
  | { kind: 'directory'; path: string; entries: readonly string[]; bytes: number }

const DEFAULT_FILE_LIMIT = 64 * 1024
const DEFAULT_TOTAL_LIMIT = 256 * 1024
const DEFAULT_DIRECTORY_ENTRIES = 200

export async function loadFileContext(options: {
  cwd: string
  paths: readonly string[]
  maxBytesPerFile?: number
  maxTotalBytes?: number
  maxDirectoryEntries?: number
}): Promise<FileContext[]> {
  const cwd = await realpath(resolve(options.cwd))
  const perFile = options.maxBytesPerFile ?? DEFAULT_FILE_LIMIT
  const totalLimit = options.maxTotalBytes ?? DEFAULT_TOTAL_LIMIT
  const directoryLimit = options.maxDirectoryEntries ?? DEFAULT_DIRECTORY_ENTRIES
  const result: FileContext[] = []
  const seen = new Set<string>()
  let total = 0
  for (const path of options.paths) {
    if (isAbsolute(path)) throw new Error(`file path must be relative: ${path}`)
    const candidate = resolve(cwd, path)
    const actual = await realpath(candidate)
    assertInside(cwd, actual)
    if (seen.has(actual)) continue
    seen.add(actual)
    const info = await stat(actual)
    const displayPath = relative(cwd, actual).split(sep).join('/') || '.'
    if (info.isDirectory()) {
      const entries = await listDirectoryEntries(actual, directoryLimit)
      const listingBytes = Buffer.byteLength(entries.join('\n'), 'utf8')
      if (total + listingBytes > totalLimit) {
        throw new Error(`attached files exceed ${totalLimit} bytes`)
      }
      result.push({ kind: 'directory', path: displayPath, entries, bytes: listingBytes })
      total += listingBytes
      continue
    }
    if (!info.isFile()) throw new Error(`file path is not a regular file: ${path}`)
    if (info.size > perFile) throw new Error(`file exceeds ${perFile} bytes: ${path}`)
    if (total + info.size > totalLimit) throw new Error(`attached files exceed ${totalLimit} bytes`)
    const bytes = await readFile(actual)
    if (bytes.length > perFile || total + bytes.length > totalLimit) {
      throw new Error(`file changed while reading: ${path}`)
    }
    const text = decodeUtf8(bytes)
    if (text.includes('\0')) throw new Error(`binary file is not supported: ${path}`)
    result.push({ kind: 'file', path: displayPath, text, bytes: bytes.length })
    total += bytes.length
  }
  return result
}

export function buildPromptBlocks(text: string, files: readonly FileContext[]): ContentBlock[] {
  if (files.length === 0) return [{ type: 'text', text }]
  const attachments = files
    .map((file) => {
      if (file.kind === 'directory') {
        return `[Attached directory: ${file.path}]\n${file.entries.join('\n')}`
      }
      const fence = '`'.repeat(Math.max(3, longestBacktickRun(file.text) + 1))
      return `[Attached file: ${file.path}]\n${fence}\n${file.text}\n${fence}`
    })
    .join('\n\n')
  return [{ type: 'text', text: `${text}\n\n${attachments}` }]
}

async function listDirectoryEntries(path: string, limit: number): Promise<string[]> {
  const entries = await readdir(path, { withFileTypes: true })
  return entries
    .sort((left, right) => left.name.localeCompare(right.name))
    .slice(0, Math.max(0, limit))
    .map((entry) => `${entry.name}${entry.isDirectory() ? '/' : ''}`)
}

function assertInside(root: string, target: string): void {
  if (!isPathInside(root, target)) {
    throw new Error('file path resolves outside the workspace')
  }
}

export function isPathInside(
  root: string,
  target: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  const pathApi = pathForPlatform(platform)
  const rest = pathApi.relative(root, target)
  return rest !== '..' && !rest.startsWith(`..${pathApi.sep}`) && !pathApi.isAbsolute(rest)
}

function decodeUtf8(bytes: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new Error('file is not valid UTF-8 text')
  }
}

function longestBacktickRun(text: string): number {
  return Math.max(...[...text.matchAll(/`+/g)].map((match) => match[0].length), 0)
}
