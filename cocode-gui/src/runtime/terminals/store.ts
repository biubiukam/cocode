/**
 * PTY byte buffers (RFC §4.5, §4.8).
 *
 * Mux frames carry raw terminal output keyed by terminal id. That stream must
 * never enter React: the panel mounts an xterm container and this store flushes
 * bytes into it. Chunks that arrive before attach sit in a small buffer.
 */

import type { MuxFrame } from '@cocode/gui-connection'
import { Observable } from '../notifier.ts'

export type TerminalMuxFrame =
  | Extract<MuxFrame, { type: 'terminal/output' }>
  | Extract<MuxFrame, { type: 'terminal/exit' }>

export function isTerminalMuxFrame(frame: MuxFrame): frame is TerminalMuxFrame {
  return frame.type === 'terminal/output' || frame.type === 'terminal/exit'
}

/** One PTY's inbound bytes and exit fact. */
export class TerminalBuffer {
  private readonly chunks: string[] = []
  private sink: ((data: string) => void) | undefined
  exited = false
  exitCode: number | null = null
  signal: string | null = null

  /**
   * Delivers one chunk, either live into the attached sink or into the backlog.
   * @param data - UTF-8 text from the PTY.
   */
  push(data: string): void {
    if (this.sink !== undefined) {
      this.sink(data)
      return
    }
    this.chunks.push(data)
  }

  /**
   * Attaches a renderer. Pending chunks flush immediately.
   * @param sink - typically `xterm.write`.
   * @returns disposer that detaches this sink only.
   */
  attach(sink: (data: string) => void): () => void {
    this.sink = sink
    for (const chunk of this.chunks) sink(chunk)
    this.chunks.length = 0
    return () => {
      if (this.sink === sink) this.sink = undefined
    }
  }
}

/**
 * Host-wide PTY buffers. One store, because mux frames are not session-scoped.
 */
export class TerminalStore {
  readonly changed = new Observable<void>(undefined)
  private readonly buffers = new Map<string, TerminalBuffer>()

  /**
   * Returns the buffer for a terminal id, creating it if the first frame raced
   * the create RPC.
   * @param terminalId - wire identity.
   */
  buffer(terminalId: string): TerminalBuffer {
    const existing = this.buffers.get(terminalId)
    if (existing !== undefined) return existing
    const created = new TerminalBuffer()
    this.buffers.set(terminalId, created)
    return created
  }

  /** Routes one terminal mux frame. */
  applyFrame(frame: TerminalMuxFrame): void {
    const buffer = this.buffer(frame.terminalId)
    if (frame.type === 'terminal/output') {
      buffer.push(frame.data)
      return
    }
    buffer.exited = true
    buffer.exitCode = frame.exitCode
    buffer.signal = frame.signal
    this.changed.set(undefined)
  }

  /** Drops a buffer after the GUI closed the tab. */
  drop(terminalId: string): void {
    this.buffers.delete(terminalId)
  }
}
