/**
 * Path authority for the workbench file surface.
 *
 * The harness owns the file policy; this module reads it rather than inventing
 * a second one. Two rules follow from that policy:
 *
 * Reads are never fenced. The harness file sandbox permits reading in every
 * mode, and the chat renders absolute paths from wherever the agent went —
 * runtime slots under the Cocode home, temp directories, sibling repositories.
 * A preview that refused them would contradict what the session just displayed.
 *
 * Writes follow the session's sandbox mode, widened by one rule: the workspace
 * stays writable in every mode. The mode governs the AGENT's file effects,
 * while these routes are the human's own hands on an explicit click, so
 * `read-only` must not turn the editor's save button into a rejection.
 */
import { realpathSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, dirname, isAbsolute, resolve } from "node:path"
import type { SandboxMode, WorkbenchContext } from "./host-types.ts"
import { resolveSessionCwd } from "./session-cwd.ts"

/** Resolve symlinks the way the harness sandbox does, so `/tmp` matches `/private/tmp`. */
function canonical(path: string): string | undefined {
  try {
    return realpathSync.native(path)
  } catch { return undefined }
}

/**
 * Canonical identity of a path that need not exist yet. Only the deepest
 * existing ancestor can be resolved; the missing tail is appended verbatim, so
 * a new file under a symlinked directory still lands inside the real root.
 */
function canonicalTarget(path: string): string {
  const tail: string[] = []
  let current = path
  for (;;) {
    const resolved = canonical(current)
    if (resolved !== undefined) return resolve(resolved, ...tail.reverse())
    const parent = dirname(current)
    if (parent === current) return path
    tail.push(basename(current))
    current = parent
  }
}

/** True when `path` is the root itself or sits under it. */
function isUnder(root: string, path: string): boolean {
  return path === root || path.startsWith(root.endsWith("/") ? root : `${root}/`)
}

/**
 * Roots the workbench may write under, or `undefined` when the mode lifts the
 * fence entirely. The workspace is always present: `read-only` empties the
 * agent's allow-list, but the human still owns the project directory.
 */
function writableRoots(mode: SandboxMode, workspace: string): readonly string[] | undefined {
  if (mode === "danger-full-access") return undefined
  const roots = mode === "workspace-write" ? [workspace, "/tmp", tmpdir()] : [workspace]
  return [...new Set(roots.map(root => canonical(root) ?? root))]
}

function textField(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key]
  return typeof value === "string" && value.trim() !== "" ? value : undefined
}

/**
 * The session's file-effect mode. `sandboxPolicy` is optional so the plugin
 * still runs in a composition without the sandbox stack; without it the
 * workbench assumes the narrowest mode, which leaves the workspace as the only
 * writable root.
 */
function sandboxMode(ctx: WorkbenchContext, payload: Record<string, unknown>): SandboxMode {
  const sessionId = textField(payload, "sessionId")
  const session = sessionId === undefined ? undefined : ctx.sessions.get(sessionId)
  return ctx.get("sandboxPolicy")?.resolve({ session }).mode ?? "read-only"
}

/** Workspace of this request; also the write root the human always keeps. */
export function sessionCwd(ctx: WorkbenchContext, payload: Record<string, unknown>): string {
  return resolveSessionCwd(ctx, textField(payload, "sessionId"), textField(payload, "cwd"))
}

/** Absolute form of a requested path. Relative spellings resolve against the workspace. */
export function absolutePath(cwd: string, requested: string | undefined): string {
  if (requested === undefined) return cwd
  return isAbsolute(requested) ? resolve(requested) : resolve(cwd, requested)
}

/** Absolute path of a read target; every readable path of the host process qualifies. */
export function readablePath(ctx: WorkbenchContext, payload: Record<string, unknown>, key: string): string {
  return absolutePath(sessionCwd(ctx, payload), textField(payload, key))
}

/** Whether the current mode lets this request write `absolute`. */
export function canWrite(ctx: WorkbenchContext, payload: Record<string, unknown>, absolute: string): boolean {
  const roots = writableRoots(sandboxMode(ctx, payload), sessionCwd(ctx, payload))
  if (roots === undefined) return true
  const target = canonicalTarget(absolute)
  return roots.some(root => isUnder(root, target))
}

/** Gate a mutation, echoing the harness wording so both denials read the same. */
export function assertWritable(ctx: WorkbenchContext, payload: Record<string, unknown>, absolute: string): string {
  if (canWrite(ctx, payload, absolute)) return absolute
  throw new Error(`cannot write "${absolute}": file access denied under ${sandboxMode(ctx, payload)} mode`)
}

/** Absolute path of a mutation target, rejected up front when the mode forbids it. */
export function writablePath(ctx: WorkbenchContext, payload: Record<string, unknown>, key: string): string {
  return assertWritable(ctx, payload, readablePath(ctx, payload, key))
}
