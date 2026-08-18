import { execFile } from "node:child_process"
import { readdir } from "node:fs/promises"
import { promisify } from "node:util"
import { join, relative } from "pathe"
import type { WorkbenchContext } from "./host-types.ts"
import { sessionCwd } from "./file-access.ts"
import { toPosix } from "./paths.ts"

const exec = promisify(execFile)
const MAX_FILES = 2000
const MAX_DEPTH = 8
const SKIP_DIRECTORIES = new Set([".git", "node_modules", "dist", "build", ".next"])

/**
 * Workspace-relative paths for the composer `@` picker. Prefer git's
 * tracked-plus-unignored listing; walk the tree when the directory is not a
 * repo. Directories keep a trailing slash so a pick can name a folder.
 */
export async function searchWorkspace(
  ctx: WorkbenchContext,
  payload: Record<string, unknown>,
): Promise<{ readonly paths: readonly string[] }> {
  const cwd = sessionCwd(ctx, payload)
  const paths = await listEntries(cwd)
  return { paths }
}

async function listEntries(cwd: string): Promise<string[]> {
  try {
    const result = await exec("git", ["-C", cwd, "ls-files", "-co", "--exclude-standard", "-z"], {
      encoding: "buffer",
      maxBuffer: 4 * 1024 * 1024,
    })
    const files = result.stdout.toString("utf8").split("\0").filter(Boolean).map(toPosix)
    return addParentDirectories(files).slice(0, MAX_FILES)
  } catch {
    return walkWorkspace(cwd)
  }
}

async function walkWorkspace(cwd: string): Promise<string[]> {
  const result: string[] = []
  const visit = async (directory: string, depth: number): Promise<void> => {
    if (result.length >= MAX_FILES || depth > MAX_DEPTH) return
    let entries
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (result.length >= MAX_FILES) return
      const relativePath = toPosix(relative(cwd, join(directory, entry.name)))
      if (entry.isDirectory()) {
        if (SKIP_DIRECTORIES.has(entry.name)) continue
        result.push(`${relativePath}/`)
        await visit(join(directory, entry.name), depth + 1)
        continue
      }
      if (entry.isFile()) result.push(relativePath)
    }
  }
  await visit(cwd, 0)
  return result.sort()
}

function addParentDirectories(files: readonly string[]): string[] {
  const entries = new Set(files)
  for (const file of files) {
    const parts = file.split("/")
    for (let index = 1; index < parts.length; index += 1) {
      entries.add(`${parts.slice(0, index).join("/")}/`)
    }
  }
  return [...entries].sort()
}
