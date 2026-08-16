/** Keep Ink's full-frame redraw from exercising Terminal.app's fragile clear path. */

const CLEAR_SCROLLBACK = '\u001b[3J'
const FULL_REDRAW = '\u001b[2J\u001b[3J\u001b[H'
const SAFE_REDRAW = '\u001b[H\u001b[J'
const ANSI_SEQUENCE = /\u001b\[[0-?]*[ -/]*[@-~]/g

export type TerminalCursorAnchor = {
  /** 1-based row in the current Ink frame. */
  row: number
  /** 1-based column in the current Ink frame. */
  column: number
}

export type TerminalOutput = NodeJS.WriteStream & {
  setCursorAnchor?: (anchor: TerminalCursorAnchor | undefined) => void
}

export function createTerminalOutput(
  output: NodeJS.WriteStream,
  options: { extraRows?: number } = {},
): TerminalOutput {
  const extraRows = Math.max(0, Math.trunc(options.extraRows ?? 0))
  let frameRows = 0
  let pendingAnchor: TerminalCursorAnchor | undefined
  const absoluteCursor = (row: number, column: number): string => `\u001b[${row};${column}H`

  return new Proxy(output, {
    get(target, property, receiver) {
      if (property === 'rows' && extraRows > 0) return (target.rows ?? 0) + extraRows
      if (property === 'cocodeViewportRows' && extraRows > 0) return target.rows
      if (property === 'setCursorAnchor') {
        return (anchor: TerminalCursorAnchor | undefined): void => {
          pendingAnchor = anchor
          if (anchor === undefined || frameRows <= 0) return
          const row = Math.max(1, Math.min(frameRows + 1, Math.trunc(anchor.row)))
          const column = Math.max(1, Math.trunc(anchor.column))
          target.write(absoluteCursor(row, column))
        }
      }
      if (property !== 'write') return Reflect.get(target, property, receiver)
      return (chunk: unknown, ...args: unknown[]) => {
        let text = typeof chunk === 'string' ? chunk : Buffer.isBuffer(chunk) ? chunk.toString() : String(chunk)
        text = text.replaceAll(FULL_REDRAW, SAFE_REDRAW).replaceAll(CLEAR_SCROLLBACK, '')

        // Ink's log-update assumes the cursor is at the end of the previous frame.
        // Restore that position before letting Ink erase and paint the next frame.
        const prefix = frameRows > 0 ? absoluteCursor(frameRows + 1, 1) : ''
        const visible = text.replace(ANSI_SEQUENCE, '')
        frameRows = Math.max(0, visible.split('\n').length - 1)
        const anchor = pendingAnchor
        const anchorSequence = anchor === undefined
          ? ''
          : absoluteCursor(
              Math.max(1, Math.min(frameRows + 1, Math.trunc(anchor.row))),
              Math.max(1, Math.trunc(anchor.column)),
            )
        const result = target.write(`${prefix}${text}${anchorSequence}`, ...(args as []))
        return result
      }
    },
  })
}
