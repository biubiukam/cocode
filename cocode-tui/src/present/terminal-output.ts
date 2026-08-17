/** Adapt Ink's redraw protocol to terminals that do not support all control modes. */

import { paintColumns } from './panel-layout.ts'
import stringWidth from 'string-width'

const CLEAR_SCROLLBACK = '\u001b[3J'
const FULL_REDRAW = '\u001b[2J\u001b[3J\u001b[H'
const SAFE_REDRAW = '\u001b[H\u001b[J'
const ANSI_SEQUENCE = /\u001b\[[0-?]*[ -/]*[@-~]/g
const CURSOR_SUFFIX = /\u001b\[(\d+)A(\u001b\[\d+G)\u001b\[\?25h/
const FULLSCREEN_RELATIVE_PREFIX =
  /^(\u001b\[\?25l)?(?:(?:\u001b\[\d+B)?\u001b\[1G)?(?:\u001b\[2K\u001b\[1A)*\u001b\[2K\u001b\[G/

export type TerminalOutput = NodeJS.WriteStream & {
  cocodeTerminalColumns?: number
}

/** Read the real TTY viewport, bypassing Ink-facing stdout proxies. */
export function terminalViewport(stream: NodeJS.WriteStream): { columns: number; rows: number } {
  const output = stream as TerminalOutput
  return {
    columns: output.cocodeTerminalColumns ?? stream.columns ?? 80,
    rows: stream.rows ?? 24,
  }
}

export function createTerminalOutput(output: NodeJS.WriteStream): TerminalOutput {
  let fullScreenFrame = false

  return new Proxy(output, {
    get(target, property, receiver) {
      if (property === 'columns') return paintColumns(target.columns ?? 80)
      if (property === 'cocodeTerminalColumns') return target.columns
      if (property !== 'write') return Reflect.get(target, property, receiver)
      return (chunk: unknown, ...args: unknown[]) => {
        const text = typeof chunk === 'string'
          ? chunk
          : Buffer.isBuffer(chunk)
            ? chunk.toString()
            : String(chunk)
        const normalized = text
          .replaceAll(FULL_REDRAW, SAFE_REDRAW)
          .replaceAll(CLEAR_SCROLLBACK, '')
        const visible = normalized.replace(ANSI_SEQUENCE, '')
        const nextIsFullScreen =
          !visible.endsWith('\n') &&
          visualRowCount(visible, paintColumns(target.columns ?? 80)) >=
            Math.max(1, target.rows ?? 24)
        const cursorOnlyFullScreen =
          visible === '' && fullScreenFrame && CURSOR_SUFFIX.test(normalized)
        const isFullScreenRedraw =
          nextIsFullScreen && FULLSCREEN_RELATIVE_PREFIX.test(normalized)
        const frame = isFullScreenRedraw
          ? normalized.replace(
              FULLSCREEN_RELATIVE_PREFIX,
              (_match, hideCursor: string | undefined) => `${hideCursor ?? ''}${SAFE_REDRAW}`,
            )
          : normalized
        const adjusted = nextIsFullScreen || cursorOnlyFullScreen
          ? frame.replace(CURSOR_SUFFIX, (_match, moveUp: string, cursorTo: string) => {
              const amount = Number.parseInt(moveUp, 10)
              return `${amount > 1 ? `\u001b[${amount - 1}A` : ''}${cursorTo}\u001b[?25h`
            })
          : frame
        if (visible !== '') {
          fullScreenFrame = nextIsFullScreen
        } else if (normalized.includes('\u001b[2K') || normalized.includes(SAFE_REDRAW)) {
          fullScreenFrame = false
        }
        return target.write(adjusted, ...(args as []))
      }
    },
  })
}

function visualRowCount(text: string, columns: number): number {
  const width = Math.max(1, Math.trunc(columns))
  return text.split('\n').reduce((rows, line) => {
    return rows + Math.max(1, Math.ceil(stringWidth(line) / width))
  }, 0)
}
