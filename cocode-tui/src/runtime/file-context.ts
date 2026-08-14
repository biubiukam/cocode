/** Load safe workspace file attachments and format them as prompt text. */

import { readFile, realpath, stat } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import type { ContentBlock } from '@cocode/tui-connection'

export type FileContext = {
  path: string
  text: string
  bytes: number
}

const DEFAULT_FILE_LIMIT = 64 * 1024
const DEFAULT_TOTAL_LIMIT = 256 * 1024

export async function loadFileContext(options: {
  cwd: string
  paths: readonly string[]
  maxBytesPerFile?: number
  maxTotalBytes?: number
}): Promise<FileContext[]> {
  const cwd = await realpath(resolve(options.cwd))
  const perFile = options.maxBytesPerFile ?? DEFAULT_FILE_LIMIT
  const totalLimit = options.maxTotalBytes ?? DEFAULT_TOTAL_LIMIT
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
    if (!info.isFile()) throw new Error(`file path is not a regular file: ${path}`)
    if (info.size > perFile) throw new Error(`file exceeds ${perFile} bytes: ${path}`)
    if (total + info.size > totalLimit) throw new Error(`attached files exceed ${totalLimit} bytes`)
    const bytes = await readFile(actual)
    if (bytes.length > perFile || total + bytes.length > totalLimit) {
      throw new Error(`file changed while reading: ${path}`)
    }
    const text = decodeUtf8(bytes)
    if (text.includes('\0')) throw new Error(`binary file is not supported: ${path}`)
    result.push({ path: relative(cwd, actual).split(sep).join('/'), text, bytes: bytes.length })
    total += bytes.length
  }
  return result
}

export function buildPromptBlocks(text: string, files: readonly FileContext[]): ContentBlock[] {
  if (files.length === 0) return [{ type: 'text', text }]
  const attachments = files
    .map((file) => {
      const fence = '`'.repeat(Math.max(3, longestBacktickRun(file.text) + 1))
      return `[Attached file: ${file.path}]\n${fence}\n${file.text}\n${fence}`
    })
    .join('\n\n')
  return [{ type: 'text', text: `${text}\n\n${attachments}` }]
}

function assertInside(root: string, target: string): void {
  const rest = relative(root, target)
  if (rest === '..' || rest.startsWith(`..${'/'}`) || isAbsolute(rest)) {
    throw new Error('file path resolves outside the workspace')
  }
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
