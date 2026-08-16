import { Writable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { createTerminalOutput } from '../../src/present/terminal-output.ts'

describe('terminal output IME cursor anchor', () => {
  it('moves the native terminal cursor to the composer and restores Ink position before redraw', () => {
    const target = new CaptureStream()
    const output = createTerminalOutput(target as unknown as NodeJS.WriteStream)

    output.write('header\ncomposer\n')
    output.setCursorAnchor?.({ row: 2, column: 5 })
    output.write('next\nframe\n')

    expect(target.value).toContain('\u001b[2;5H')
    expect(target.value).toContain('\u001b[3;1Hnext\nframe\n')
  })
})

class CaptureStream extends Writable {
  value = ''

  _write(chunk: Buffer | string, _encoding: BufferEncoding, callback: () => void): void {
    this.value += chunk.toString()
    callback()
  }
}
