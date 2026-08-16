/**
 * Workbench terminal process table. One pseudo terminal per
 * `${sessionId}:${terminalId}` key, so a panel keeps the same shell across a
 * socket drop (page refresh, session switch, dock collapse) and only loses it
 * when the panel itself is closed or the grace period expires.
 *
 * Everything a reconnecting client needs lives here: the bounded transcript it
 * replays before live output resumes, and the exit status of a shell that
 * already ended (a dead terminal must show its last words, not an input sink).
 */
import * as nodePty from "node-pty"

/** Replay buffer bound, in characters kept per terminal. */
const TRANSCRIPT_LIMIT = 512 * 1024

/** Smallest viable geometry; a hidden panel reports zero and must not spawn a 0x0 tty. */
const MIN_COLUMNS = 2
const MIN_ROWS = 2

export interface TerminalGeometry {
  readonly cols: number
  readonly rows: number
}

export interface TerminalProcess {
  readonly key: string
  readonly sessionId: string
  /** Directory the shell was spawned in; a different one forces a respawn. */
  readonly cwd: string
  readonly shell: string
  readonly pty: nodePty.IPty
  /** Output since spawn, oldest chunks dropped past {@link TRANSCRIPT_LIMIT}. */
  transcript: string[]
  transcriptSize: number
  exited: boolean
  exitCode?: number
}

export interface TerminalRegistryOptions {
  /** Concurrent terminals one session may hold. */
  readonly limitPerSession: number
  /** How long a terminal outlives its socket, awaiting a reconnect. */
  readonly graceMs: number
}

/** The interactive shell of this platform. */
export function defaultShell(): string {
  if (process.platform === "win32") return process.env.ComSpec ?? "powershell.exe"
  const shell = process.env.SHELL
  return shell === undefined || shell.trim() === "" ? "/bin/bash" : shell
}

/**
 * Shell arguments. macOS terminals run login shells because a GUI app is
 * launched without the user's profile environment, so anything but a login
 * shell would start with a stub PATH.
 */
function shellArguments(): string[] {
  return process.platform === "darwin" ? ["-l"] : []
}

/** Clamp a client-reported geometry into a spawnable one. */
export function clampGeometry(geometry: TerminalGeometry): TerminalGeometry {
  return {
    cols: Math.max(MIN_COLUMNS, Math.floor(geometry.cols) || MIN_COLUMNS),
    rows: Math.max(MIN_ROWS, Math.floor(geometry.rows) || MIN_ROWS),
  }
}

/** Registry key of one panel's terminal. */
export function terminalKey(sessionId: string, terminalId: string): string {
  return `${sessionId}:${terminalId}`
}

export class TerminalLimitError extends Error {}

export class TerminalRegistry {
  readonly #processes = new Map<string, TerminalProcess>()
  readonly #pendingCloses = new Map<string, ReturnType<typeof setTimeout>>()
  readonly #options: TerminalRegistryOptions

  constructor(options: TerminalRegistryOptions) {
    this.#options = options
  }

  get(key: string): TerminalProcess | undefined {
    return this.#processes.get(key)
  }

  /**
   * Attach to a terminal, spawning one when the key is free. A live shell in
   * the same directory is reused as-is: reconnecting must not restart work in
   * progress. A shell that already exited is kept so the client can show its
   * transcript and offer a restart; only a directory change (the session
   * hydrated its real cwd after the first connect) respawns silently.
   * @throws {TerminalLimitError} when the session already holds its maximum.
   */
  open(sessionId: string, terminalId: string, cwd: string, geometry: TerminalGeometry): TerminalProcess {
    const key = terminalKey(sessionId, terminalId)
    this.#cancelClose(key)
    const existing = this.#processes.get(key)
    if (existing !== undefined && (existing.cwd === cwd || existing.exited)) return existing
    if (existing !== undefined) this.close(key)
    if (this.#running(sessionId) >= this.#options.limitPerSession) this.#reclaim(sessionId)
    if (this.#running(sessionId) >= this.#options.limitPerSession) {
      throw new TerminalLimitError(`this session already has ${this.#options.limitPerSession} terminals open`)
    }
    return this.#spawn(key, sessionId, cwd, geometry)
  }

  /**
   * Let a terminal outlive its socket. A dropped socket cannot tell a closed
   * panel from a reload, so every detach waits out the grace period and the
   * reconnect's {@link open} cancels the pending close.
   */
  release(key: string): void {
    if (!this.#processes.has(key)) return
    this.#cancelClose(key)
    const timer = setTimeout(() => { this.close(key) }, this.#options.graceMs)
    timer.unref?.()
    this.#pendingCloses.set(key, timer)
  }

  /** Kill a terminal and forget its transcript. */
  close(key: string): void {
    this.#cancelClose(key)
    const entry = this.#processes.get(key)
    if (entry === undefined) return
    this.#processes.delete(key)
    try {
      entry.pty.kill()
    } catch {
      // Already gone; nothing left to kill.
    }
  }

  /** Plugin teardown: every terminal dies with the host. */
  disposeAll(): void {
    for (const timer of this.#pendingCloses.values()) clearTimeout(timer)
    this.#pendingCloses.clear()
    for (const key of [...this.#processes.keys()]) this.close(key)
  }

  #spawn(key: string, sessionId: string, cwd: string, geometry: TerminalGeometry): TerminalProcess {
    const size = clampGeometry(geometry)
    const shell = defaultShell()
    const entry: TerminalProcess = {
      key,
      sessionId,
      cwd,
      shell,
      pty: nodePty.spawn(shell, shellArguments(), {
        name: "xterm-256color",
        cols: size.cols,
        rows: size.rows,
        cwd,
        env: { ...process.env, TERM: "xterm-256color", COLORTERM: "truecolor" } as Record<string, string>,
      }),
      transcript: [],
      transcriptSize: 0,
      exited: false,
    }
    entry.pty.onData(chunk => { appendTranscript(entry, chunk) })
    entry.pty.onExit(({ exitCode }) => {
      entry.exited = true
      entry.exitCode = exitCode
    })
    this.#processes.set(key, entry)
    return entry
  }

  /**
   * Free one seat by dropping the session's longest-detached terminal. A
   * terminal only awaits a reconnect because its panel went away, so it must
   * yield to a panel the user is opening right now.
   */
  #reclaim(sessionId: string): void {
    for (const key of this.#pendingCloses.keys()) {
      if (this.#processes.get(key)?.sessionId !== sessionId) continue
      this.close(key)
      return
    }
  }

  /** Seats a session holds: an exited shell keeps its transcript, not a seat. */
  #running(sessionId: string): number {
    let count = 0
    for (const entry of this.#processes.values()) {
      if (entry.sessionId === sessionId && !entry.exited) count += 1
    }
    return count
  }

  #cancelClose(key: string): void {
    const timer = this.#pendingCloses.get(key)
    if (timer === undefined) return
    clearTimeout(timer)
    this.#pendingCloses.delete(key)
  }
}

/** Record output for replay, dropping the oldest chunks past the bound. */
function appendTranscript(entry: TerminalProcess, chunk: string): void {
  entry.transcript.push(chunk)
  entry.transcriptSize += chunk.length
  while (entry.transcriptSize > TRANSCRIPT_LIMIT && entry.transcript.length > 1) {
    entry.transcriptSize -= entry.transcript.shift()?.length ?? 0
  }
}
