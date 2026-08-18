/**
 * Terminal wire contract, shared by the host route and the panel.
 *
 * One WebSocket carries both directions of a pseudo terminal: binary frames
 * are raw UTF-8 terminal bytes (keystrokes upstream, output downstream) and
 * text frames are JSON control messages. Splitting them by frame type keeps
 * payload bytes uninterpreted — a shell may print anything, including JSON.
 */

/** Upgrade path owned by the workbench terminal. */
export const TERMINAL_SOCKET_PATH = "/cocode/workbench/terminal"

/** Close code for a refusal: the reason is final, so retrying cannot help. */
export const TERMINAL_REFUSED_CODE = 1011

/** Close code for a transient handshake failure; the panel reconnects with backoff. */
export const TERMINAL_RETRYABLE_CODE = 1013

/** Close code telling the panel a newer socket took the terminal over. */
export const TERMINAL_SUPERSEDED_CODE = 4001

/** Control messages the panel sends. */
export type TerminalClientMessage = { readonly type: "resize"; readonly cols: number; readonly rows: number }

/** Control messages the host sends. */
export type TerminalHostMessage =
  /** The socket owns a shell; `restored` marks a reconnect that replayed output. */
  | { readonly type: "attached"; readonly cwd: string; readonly shell: string; readonly restored: boolean }
  | { readonly type: "exit"; readonly code: number }
  /** Another socket took over this terminal; this one must not reconnect. */
  | { readonly type: "superseded" }

/** Parse a control frame, returning undefined for anything unrecognized. */
export function parseTerminalMessage<T extends { type: string }>(raw: string): T | undefined {
  try {
    const value = JSON.parse(raw) as unknown
    if (value === null || typeof value !== "object") return undefined
    return typeof (value as { type?: unknown }).type === "string" ? value as T : undefined
  } catch {
    return undefined
  }
}
