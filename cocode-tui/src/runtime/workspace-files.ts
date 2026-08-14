/** Discover workspace files and rank them for an @-mention picker. */

import { execFile } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import { promisify } from 'node:util'
import { join, relative, resolve, sep } from 'node:path'

const execFileAsync = promisify(execFile)
const SKIP_DIRECTORIES = new Set(['.git', 'node_modules', 'dist', 'build', '.next'])

export async function listWorkspaceFiles(options: {
  cwd: string
  maxFiles?: number
  maxDepth?: number
}): Promise<string[]> {
  const cwd = resolve(options.cwd)
  const maxFiles = options.maxFiles ?? 2_000
  try {
    const result = await execFileAsync(
      'git',
      ['-C', cwd, 'ls-files', '-co', '--exclude-standard', '-z'],
      {
        encoding: 'buffer',
        maxBuffer: 4 * 1024 * 1024,
      },
    )
    const files = result.stdout.toString('utf8').split('\0').filter(Boolean)
    return files.slice(0, maxFiles).map((file) => file.split(sep).join('/'))
  } catch {
    return walkWorkspace(cwd, maxFiles, options.maxDepth ?? 8)
  }
}

export function rankFileMatches(files: readonly string[], query: string, limit = 20): string[] {
  const needle = query.trim().toLowerCase()
  return files
    .map((file, index) => ({ file, index, score: fileScore(file, needle) }))
    .filter((entry) => entry.score !== undefined)
    .sort(
      (left, right) => (right.score as number) - (left.score as number) || left.index - right.index,
    )
    .slice(0, Math.max(0, limit))
    .map((entry) => entry.file)
}

async function walkWorkspace(cwd: string, maxFiles: number, maxDepth: number): Promise<string[]> {
  const result: string[] = []
  const visit = async (directory: string, depth: number): Promise<void> => {
    if (result.length >= maxFiles || depth > maxDepth) return
    let entries
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (result.length >= maxFiles) return
      if (entry.isDirectory()) {
        if (!SKIP_DIRECTORIES.has(entry.name)) await visit(join(directory, entry.name), depth + 1)
      } else if (entry.isFile()) {
        result.push(relative(cwd, join(directory, entry.name)).split(sep).join('/'))
      }
    }
  }
  await visit(cwd, 0)
  return result.sort()
}

function fileScore(file: string, query: string): number | undefined {
  if (query === '') return 0
  const lower = file.toLowerCase()
  const base = lower.slice(Math.max(0, lower.lastIndexOf('/') + 1))
  if (lower === query) return 1_000
  if (base.startsWith(query)) return 800 - base.length / 100
  if (lower.startsWith(query)) return 700 - lower.length / 100
  const index = lower.indexOf(query)
  if (index >= 0) return 500 - index - lower.length / 100
  let cursor = 0
  for (const character of query) {
    cursor = lower.indexOf(character, cursor)
    if (cursor < 0) return undefined
    cursor += 1
  }
  return 100 - lower.length / 100
}
