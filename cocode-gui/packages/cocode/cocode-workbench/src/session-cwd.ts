import { isAbsolute, resolve } from "pathe"
import type { WorkbenchContext } from "./host-types.ts"

/** The session exists in navigation, but its Host workspace has not arrived yet. */
export class SessionWorkspaceNotReadyError extends Error {
  override readonly name = "SessionWorkspaceNotReadyError"

  constructor() {
    super("session workspace is not ready")
  }
}

/**
 * Authoritative working directory of a workbench operation.
 *
 * The live session's own cwd wins. A caller-supplied one covers the window
 * where the client has a listed session that is not live in the host store
 * yet (the first panel requests of a page load). `process.cwd()` is only
 * the last resort for a blank surface with no session id — using it as the
 * fence for a named session marks every real workspace path as outside.
 */
export function resolveSessionCwd(ctx: WorkbenchContext, sessionId?: string, supplied?: string): string {
  const attached = sessionId === undefined ? undefined : ctx.sessions.get(sessionId)?.header?.cwd
  const listed = supplied !== undefined && supplied.trim() !== "" ? supplied : undefined
  const cwd = attached ?? listed ?? (sessionId === undefined ? process.cwd() : undefined)
  if (cwd === undefined) throw new SessionWorkspaceNotReadyError()
  if (!isAbsolute(cwd)) throw new Error("invalid working directory")
  return resolve(cwd)
}
