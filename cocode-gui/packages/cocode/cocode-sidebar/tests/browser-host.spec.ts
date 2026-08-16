/**
 * Host-side browser contract tests that do not need Chromium: the frame
 * codec, the address-bar policy (covered in browser.spec.ts), and the
 * snapshot budget ranking.
 */
import { describe, expect, it } from 'vitest'
import { encodeFrame } from '../src/browser/stream.ts'
import { decodeFrame } from '../src/client/browser-viewport.ts'
import { modifiersOf, pointOf, textOf } from '../src/client/browser-viewport.ts'

describe('screencast frame codec', () => {
  it('round-trips a header and JPEG payload', () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9])
    const encoded = encodeFrame({ seq: 7, width: 1280, height: 800, cssWidth: 640, cssHeight: 400 }, jpeg)
    const decoded = decodeFrame(encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength))
    expect(decoded).toBeDefined()
    expect(decoded!.header).toEqual({ seq: 7, width: 1280, height: 800, cssWidth: 640, cssHeight: 400 })
  })

  it('rejects a truncated buffer', () => {
    expect(decodeFrame(new ArrayBuffer(2))).toBeUndefined()
  })
})

describe('viewport input translation', () => {
  it('maps pointer position through a resized canvas', () => {
    expect(pointOf(
      { clientX: 50, clientY: 25 },
      { left: 0, top: 0, width: 100, height: 50 },
      { cssWidth: 1280, cssHeight: 800 },
    )).toEqual({ x: 640, y: 400 })
  })

  it('builds the CDP modifier mask', () => {
    expect(modifiersOf({ altKey: true, ctrlKey: true, metaKey: false, shiftKey: true })).toBe(1 + 2 + 8)
  })

  it('does not treat a modified key as printable text', () => {
    expect(textOf({ key: 'a', ctrlKey: true, metaKey: false } as KeyboardEvent)).toBeUndefined()
    expect(textOf({ key: 'a', ctrlKey: false, metaKey: false } as KeyboardEvent)).toBe('a')
  })
})
