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
