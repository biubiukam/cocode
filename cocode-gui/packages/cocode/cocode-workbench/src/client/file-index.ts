import { relativeTo } from "../paths.ts"
import { workbenchCwd, workbenchRequest } from "./runtime-api.ts"

const MAX_FILES = 2000
const MAX_DEPTH = 8
const SKIP_DIRECTORIES = new Set([".git", "node_modules", "dist", "build", ".next"])

interface TreeListing {
  readonly path?: string
  readonly entries?: readonly {
    readonly name: string
    readonly path: string
    readonly isDir: boolean
  }[]
}

/** Session-scoped workspace index for the composer `@` picker. */
export async function listMentionPaths(sessionId: string, cwd = workbenchCwd()): Promise<readonly string[]> {
  const payload = { sessionId, ...(cwd === undefined ? {} : { cwd }) }
  try {
    const result = await workbenchRequest<{ paths?: readonly string[] }>("fs.search", payload)
    if ((result.paths?.length ?? 0) > 0) return result.paths ?? []
  } catch {
    // Older hosts have no fs.search; the one-level tree walk below still works.
  }
  return walkTree(payload)
}

async function walkTree(payload: { sessionId: string; cwd?: string }): Promise<string[]> {
  const result: string[] = []
  const visit = async (dir: string | undefined, depth: number): Promise<void> => {
    if (result.length >= MAX_FILES || depth > MAX_DEPTH) return
    let listing: TreeListing
    try {
      listing = await workbenchRequest<TreeListing>("fs.tree", {
        ...payload,
        ...(dir === undefined ? {} : { path: dir }),
      })
    } catch {
      return
    }
    const root = payload.cwd ?? listing.path
    for (const entry of listing.entries ?? []) {
      if (result.length >= MAX_FILES) return
      if (SKIP_DIRECTORIES.has(entry.name)) continue
      const relative = root === undefined ? entry.path : relativeTo(root, entry.path)
      if (relative === "" || relative === ".") continue
      if (entry.isDir) {
        result.push(relative.endsWith("/") ? relative : `${relative}/`)
        await visit(entry.path, depth + 1)
        continue
      }
      result.push(relative)
    }
  }
  await visit(undefined, 0)
  return result
}
