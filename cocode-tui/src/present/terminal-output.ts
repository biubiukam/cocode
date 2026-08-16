/** Keep Ink's full-frame redraw from exercising Terminal.app's fragile clear path. */

import { paintColumns } from './panel-layout.ts'
import stringWidth from 'string-width'

const CLEAR_SCROLLBACK = '\u001b[3J'
const FULL_REDRAW = '\u001b[2J\u001b[3J\u001b[H'
const SAFE_REDRAW = '\u001b[H\u001b[J'
const HIDE_CURSOR = '\u001b[?25l'
const SHOW_CURSOR = '\u001b[?25h'
const ERASE_SEQUENCE = /\u001b\[[0-?]*[ -/]*[JK]/

export type TerminalOutput = NodeJS.WriteStream & {
  cocodeViewportRows?: number
  cocodeTerminalColumns?: number
}

/** Read the real TTY viewport, bypassing Ink-facing stdout proxies. */
export function terminalViewport(stream: NodeJS.WriteStream): { columns: number; rows: number } {
  const output = stream as TerminalOutput
  return {
    columns: output.cocodeTerminalColumns ?? stream.columns ?? 80,
    rows: output.cocodeViewportRows ?? stream.rows ?? 24,
  }
}

export function createTerminalOutput(
  output: NodeJS.WriteStream,
  options: { extraRows?: number } = {},
): TerminalOutput {
  const extraRows = Math.max(0, Math.trunc(options.extraRows ?? 0))
  let frameEndRow = 0

  return new Proxy(output, {
    get(target, property, receiver) {
      if (property === 'rows' && extraRows > 0) return (target.rows ?? 0) + extraRows
      if (property === 'cocodeViewportRows') return target.rows
      if (property === 'columns') return paintColumns(target.columns ?? 80)
      if (property === 'cocodeTerminalColumns') return target.columns
      if (property !== 'write') return Reflect.get(target, property, receiver)
      return (chunk: unknown, ...args: unknown[]) => {
        const text = typeof chunk === 'string'
          ? chunk
          : Buffer.isBuffer(chunk)
            ? chunk.toString()
            : String(chunk)
        const normalized = text.replaceAll(FULL_REDRAW, SAFE_REDRAW).replaceAll(CLEAR_SCROLLBACK, '')
        const visible = normalized.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
        const redraw = ERASE_SEQUENCE.test(normalized)
        const cursorUpdate = normalized.includes(HIDE_CURSOR)
        // Ink's log-update assumes the cursor is immediately after the
        // previous frame. The Composer may intentionally leave it in the
        // middle of that frame for IME input, so restore the frame-end anchor
        // before Ink erases or repaints the next frame.
        const prefix = (redraw || cursorUpdate) && frameEndRow > 0
          ? `\u001b[${frameEndRow};1H`
          : ''
        if (redraw && visible === '') {
          frameEndRow = 0
        } else if (visible !== '' && (redraw || frameEndRow === 0)) {
          const lines = visible.split('\n')
          const contentLines = visible.endsWith('\n') ? lines.slice(0, -1) : lines
          const rows = contentLines.reduce((total, line) => {
            return total + Math.max(1, Math.ceil(stringWidth(line) / Math.max(1, target.columns ?? 80)))
          }, 0)
          frameEndRow = rows + (visible.endsWith('\n') ? 1 : 0)
        } else if (visible === '' && normalized === SHOW_CURSOR) {
          frameEndRow = 0
        }
        return target.write(`${prefix}${normalized}`, ...(args as []))
      }
    },
  })
}
