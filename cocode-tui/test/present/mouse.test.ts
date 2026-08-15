import { describe, expect, it, vi } from 'vitest'
import {
  createMouseDecoder,
  enableMouseTracking,
  isMouseInput,
  mouseWheelDelta,
} from '../../src/present/mouse.ts'

describe('terminal mouse support', () => {
  it('decodes SGR press, release, modifiers, and wheel events', () => {
    const events: unknown[] = []
    const decoder = createMouseDecoder((event) => events.push(event))
    decoder.feed('\u001b[<0;12;8M\u001b[<20;4;3m\u001b[<64;10;11M')
    expect(events).toEqual([
      { action: 'press', button: 0, x: 12, y: 8, shift: false, alt: false, ctrl: false },
      { action: 'release', button: 0, x: 4, y: 3, shift: true, alt: false, ctrl: true },
      { action: 'press', button: 'wheel-up', x: 10, y: 11, shift: false, alt: false, ctrl: false },
    ])
  })

  it('keeps an incomplete escape sequence between chunks', () => {
    const events: unknown[] = []
    const decoder = createMouseDecoder((event) => events.push(event))
    decoder.feed('\u001b[<0;4;')
    decoder.feed('2M')
    expect(events).toHaveLength(1)
  })

  it('enables and disables SGR tracking', () => {
    const write = vi.fn()
    const leave = enableMouseTracking({ write })
    leave()
    expect(write.mock.calls).toEqual([
      ['\u001b[?1000h\u001b[?1006h'],
      ['\u001b[?1000l\u001b[?1006l'],
    ])
  })

  it('maps pressed wheel events to transcript movement', () => {
    expect(mouseWheelDelta({ action: 'press', button: 'wheel-up' })).toBe(1)
    expect(mouseWheelDelta({ action: 'press', button: 'wheel-down' })).toBe(-1)
    expect(mouseWheelDelta({ action: 'release', button: 'wheel-up' })).toBeUndefined()
    expect(mouseWheelDelta({ action: 'press', button: 0 })).toBeUndefined()
  })

  it('recognizes Ink input after it strips the leading escape byte', () => {
    expect(isMouseInput('[<64;23;18M[<65;23;18M')).toBe(true)
    expect(isMouseInput('\u001b[<64;23;18M')).toBe(true)
    expect(isMouseInput('hello')).toBe(false)
  })
})
