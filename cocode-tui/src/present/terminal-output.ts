/** Keep Ink's full-frame redraw from exercising Terminal.app's fragile clear path. */

const CLEAR_SCROLLBACK = '\u001b[3J'
const FULL_REDRAW = '\u001b[2J\u001b[3J\u001b[H'
const SAFE_REDRAW = '\u001b[H\u001b[J'

export type TerminalOutput = NodeJS.WriteStream & {
  cocodeViewportRows?: number
}

export function createTerminalOutput(
  output: NodeJS.WriteStream,
  options: { extraRows?: number } = {},
): TerminalOutput {
  const extraRows = Math.max(0, Math.trunc(options.extraRows ?? 0))

  return new Proxy(output, {
    get(target, property, receiver) {
      if (property === 'rows' && extraRows > 0) return (target.rows ?? 0) + extraRows
      if (property === 'cocodeViewportRows' && extraRows > 0) return target.rows
      if (property !== 'write') return Reflect.get(target, property, receiver)
      return (chunk: unknown, ...args: unknown[]) => {
        const text = typeof chunk === 'string'
          ? chunk
          : Buffer.isBuffer(chunk)
            ? chunk.toString()
            : String(chunk)
        return target.write(
          text.replaceAll(FULL_REDRAW, SAFE_REDRAW).replaceAll(CLEAR_SCROLLBACK, ''),
          ...(args as []),
        )
      }
    },
  })
}
