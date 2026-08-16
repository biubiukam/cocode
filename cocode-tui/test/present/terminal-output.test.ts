import { Writable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { createTerminalOutput } from '../../src/present/terminal-output.ts'

describe('terminal output', () => {
  it('rewrites Terminal.app full-clear sequences without moving the IME caret', () => {
    const target = new CaptureStream()
    const output = createTerminalOutput(target as unknown as NodeJS.WriteStream)

    output.write('\u001b[2J\u001b[3J\u001b[Hframe\n')

    expect(target.value).toBe('\u001b[H\u001b[Jframe\n')
    expect(target.value).not.toContain('\u001b[3J')
  })

  it('returns to the previous frame end before a redraw', () => {
    const target = new CaptureStream()
    const output = createTerminalOutput(target as unknown as NodeJS.WriteStream)

    output.write('first\nsecond\n')
    output.write('\u001b[2K\u001b[1A\u001b[2Knext\n')

    expect(target.value).toBe('first\nsecond\n\u001b[3;1H\u001b[2K\u001b[1A\u001b[2Knext\n')
  })

  it('restores the anchor for cursor-only updates and resets after clear', () => {
    const target = new CaptureStream()
    const output = createTerminalOutput(target as unknown as NodeJS.WriteStream)

    output.write('frame\n')
    output.write('\u001b[?25l\u001b[1A\u001b[1G\u001b[?25h')
    output.write('\u001b[2K')
    output.write('next\n')

    expect(target.value).toBe(
      'frame\n\u001b[2;1H\u001b[?25l\u001b[1A\u001b[1G\u001b[?25h\u001b[2;1H\u001b[2Knext\n',
    )
  })

  it('uses the last occupied row for a frame without a trailing newline', () => {
    const target = new CaptureStream()
    Object.assign(target, { columns: 80 })
    const output = createTerminalOutput(target as unknown as NodeJS.WriteStream)

    output.write('frame')
    output.write('\u001b[2Knext')

    expect(target.value).toBe('frame\u001b[1;1H\u001b[2Knext')
  })

  it('accounts for wide text wrapping when restoring the anchor', () => {
    const target = new CaptureStream()
    Object.assign(target, { columns: 4 })
    const output = createTerminalOutput(target as unknown as NodeJS.WriteStream)

    output.write('中文文')
    output.write('\u001b[2Knext')

    expect(target.value).toBe('中文文\u001b[2;1H\u001b[2Knext')
  })

  it('does not insert a second anchor into a split redraw', () => {
    const target = new CaptureStream()
    const output = createTerminalOutput(target as unknown as NodeJS.WriteStream)

    output.write('frame\n')
    output.write('\u001b[2K')
    output.write('next\n')

    expect(target.value).toBe('frame\n\u001b[2;1H\u001b[2Knext\n')
  })

  it('exposes the real viewport when Ink is given an extra row', () => {
    const target = new CaptureStream()
    Object.assign(target, { rows: 24 })
    const output = createTerminalOutput(target as unknown as NodeJS.WriteStream, { extraRows: 1 })

    expect(output.rows).toBe(25)
    expect(output.cocodeViewportRows).toBe(24)
  })

  it('reserves one column for Ink so full-width frames do not auto-wrap', () => {
    const target = new CaptureStream()
    Object.assign(target, { columns: 120, rows: 30 })
    const output = createTerminalOutput(target as unknown as NodeJS.WriteStream)

    expect(output.columns).toBe(119)
    expect(output.cocodeTerminalColumns).toBe(120)
  })
})

class CaptureStream extends Writable {
  value = ''
  rows = 24

  _write(chunk: Buffer | string, _encoding: BufferEncoding, callback: () => void): void {
    this.value += chunk.toString()
    callback()
  }
}
