/** Minimal SGR mouse support for terminals that expose mouse tracking. */

export type TuiMouseEvent = {
  action: 'press' | 'release' | 'move'
  button: 0 | 1 | 2 | 'wheel-up' | 'wheel-down'
  x: number
  y: number
  shift: boolean
  alt: boolean
  ctrl: boolean
}

/** Convert a pressed mouse wheel event into transcript movement. */
export function mouseWheelDelta(
  event: Pick<TuiMouseEvent, 'action' | 'button'>,
): 1 | -1 | undefined {
  if (event.action !== 'press') return undefined
  if (event.button === 'wheel-up') return 1
  if (event.button === 'wheel-down') return -1
  return undefined
}

const SGR_MOUSE = /\u001b\[<([0-9]+);([0-9]+);([0-9]+)([mM])/g
const SGR_MOUSE_INPUT = /^(?:\[<[0-9]+;[0-9]+;[0-9]+[mM])+$/
const SGR_MOUSE_FRAGMENT = /^(?:\[<[0-9;]*(?:[mM])?)+$/

/** Recognize SGR mouse input after Ink optionally removes the leading ESC byte. */
export function isMouseInput(input: string): boolean {
  const normalized = input.replaceAll('\u001b', '')
  return SGR_MOUSE_INPUT.test(normalized) || SGR_MOUSE_FRAGMENT.test(normalized)
}

export function createMouseDecoder(onEvent: (event: TuiMouseEvent) => void): {
  feed(chunk: string): void
  reset(): void
} {
  let buffer = ''
  return {
    feed(chunk) {
      buffer += chunk
      let last = 0
      for (const match of buffer.matchAll(SGR_MOUSE)) {
        const [raw, rawCode, rawX, rawY, suffix] = match
        const code = Number(rawCode)
        const x = Number(rawX)
        const y = Number(rawY)
        if (!Number.isInteger(code) || !Number.isInteger(x) || !Number.isInteger(y)) continue
        onEvent({
          action: suffix === 'M' ? code & 32 ? 'move' : 'press' : 'release',
          button: buttonFor(code),
          x,
          y,
          shift: Boolean(code & 4),
          alt: Boolean(code & 8),
          ctrl: Boolean(code & 16),
        })
        last = (match.index ?? 0) + raw.length
      }
      // Keep an incomplete escape sequence for the next stdin chunk.
      const incomplete = buffer.slice(last)
      buffer = incomplete.includes('\u001b[<') ? incomplete : ''
    },
    reset() {
      buffer = ''
    },
  }
}

export function enableMouseTracking(stream: { write(value: string): unknown }): () => void {
  stream.write('\u001b[?1000h\u001b[?1006h')
  return () => {
    stream.write('\u001b[?1000l\u001b[?1006l')
  }
}

function buttonFor(code: number): TuiMouseEvent['button'] {
  const button = code & 3
  if (code & 64) return button === 0 ? 'wheel-up' : 'wheel-down'
  if (button === 1) return 1
  if (button === 2) return 2
  return 0
}
