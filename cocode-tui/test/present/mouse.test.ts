import { describe, expect, it, vi } from 'vitest'
import {
  createMouseDecoder,
  enableMouseTracking,
  isMousePointerEvent,
  isMouseInput,
  layoutRowFromMouseY,
  mouseWheelDelta,
  shouldEnableMouseTracking,
} from '../../src/present/mouse.ts'

describe('terminal mouse support', () => {
  it('decodes SGR press, release, modifiers, and wheel events', () => {
    const events: unknown[] = []
    const decoder = createMouseDecoder((event) => events.push(event))
    decoder.feed('\u001b[<0;12;8M\u001b[<20;4;3m\u001b[<64;10;11M\u001b[<35;6;7M')
    expect(events).toEqual([
      { action: 'press', button: 0, x: 12, y: 8, shift: false, alt: false, ctrl: false },
      { action: 'release', button: 0, x: 4, y: 3, shift: true, alt: false, ctrl: true },
      { action: 'press', button: 'wheel-up', x: 10, y: 11, shift: false, alt: false, ctrl: false },
      { action: 'move', button: 'none', x: 6, y: 7, shift: false, alt: false, ctrl: false },
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
      ['\u001b[?1003h\u001b[?1006h'],
      ['\u001b[?1003l\u001b[?1006l'],
    ])
  })

  it('keeps native text selection until mouse mode or a popup needs tracking', () => {
    expect(shouldEnableMouseTracking({
      supported: true,
      manualMode: false,
      overlayOpen: false,
    })).toBe(false)
    expect(shouldEnableMouseTracking({
      supported: true,
      manualMode: false,
      overlayOpen: false,
    })).toBe(false)
    expect(shouldEnableMouseTracking({
      supported: true,
      manualMode: true,
      overlayOpen: false,
    })).toBe(true)
    expect(shouldEnableMouseTracking({
      supported: true,
      manualMode: false,
      overlayOpen: true,
    })).toBe(true)
    expect(shouldEnableMouseTracking({
      supported: false,
      manualMode: true,
      overlayOpen: true,
    })).toBe(false)
  })

  it('maps pressed wheel events to transcript movement', () => {
    expect(mouseWheelDelta({ action: 'press', button: 'wheel-up' })).toBe(1)
    expect(mouseWheelDelta({ action: 'press', button: 'wheel-down' })).toBe(-1)
    expect(mouseWheelDelta({ action: 'release', button: 'wheel-up' })).toBeUndefined()
    expect(mouseWheelDelta({ action: 'press', button: 0 })).toBeUndefined()
  })

  it('accepts SGR hover moves with button none as pointer events', () => {
    expect(isMousePointerEvent({ action: 'move', button: 'none' })).toBe(true)
    expect(isMousePointerEvent({ action: 'press', button: 0 })).toBe(true)
    expect(isMousePointerEvent({ action: 'move', button: 1 })).toBe(false)
    expect(isMousePointerEvent({ action: 'release', button: 0 })).toBe(false)
  })

  it('converts terminal mouse rows to Ink layout rows', () => {
    expect(layoutRowFromMouseY(1)).toBe(0)
    expect(layoutRowFromMouseY(8)).toBe(7)
  })

  it('recognizes Ink input after it strips the leading escape byte', () => {
    expect(isMouseInput('[<64;23;18M[<65;23;18M')).toBe(true)
    expect(isMouseInput('\u001b[<64;23;18M')).toBe(true)
    expect(isMouseInput('[<64;23;')).toBe(true)
    expect(isMouseInput('hello')).toBe(false)
  })

  it('ignores cursor movement fragments emitted by option-click selection', () => {
    expect(isMouseInput('[D')).toBe(true)
    expect(isMouseInput('[D[D[D[D')).toBe(true)
    expect(isMouseInput('\u001b[D[D[D')).toBe(true)
  })
})
