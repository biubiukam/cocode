import { PassThrough, Writable } from 'node:stream'
import React from 'react'
import { Box, render, Text, useCursor } from 'ink'
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

  it('preserves synchronized-output controls for terminals that support them', () => {
    const target = new CaptureStream()
    const output = createTerminalOutput(target as unknown as NodeJS.WriteStream)

    output.write('\u001b[?2026hframe\u001b[?2026l')

    expect(target.value).toBe('\u001b[?2026hframe\u001b[?2026l')
  })

  it('does not append a newline to a frame that fills the real viewport', async () => {
    const stdin = new InputStream()
    const target = new CaptureStream()
    const output = createTerminalOutput(target as unknown as NodeJS.WriteStream)
    const screen = render(
      React.createElement(
        Box,
        { flexDirection: 'column', height: target.rows },
        React.createElement(Text, null, 'FRAME-TOP'),
        React.createElement(Box, { flexGrow: 1 }),
        React.createElement(Text, null, 'FRAME-BOTTOM'),
      ),
      inkLive(stdin, output),
    )

    await screen.waitUntilRenderFlush()
    const visible = target.value.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
    expect(visible).toContain('FRAME-TOP')
    expect(visible.endsWith('\n')).toBe(false)

    screen.unmount()
    await new Promise<void>((resolve) => setImmediate(resolve))
    screen.cleanup()
  })

  it('keeps the hardware cursor on the requested row in a full-screen frame', async () => {
    const stdin = new InputStream()
    const target = new CaptureStream()
    Object.assign(target, { rows: 4 })
    const output = createTerminalOutput(target as unknown as NodeJS.WriteStream)
    const screen = render(
      React.createElement(CursorFrame, { rows: target.rows, cursorRow: 2 }),
      inkLive(stdin, output),
    )

    await screen.waitUntilRenderFlush()
    expect(terminalCursorPosition(target.value)).toEqual({ row: 2, column: 2 })

    screen.unmount()
    await new Promise<void>((resolve) => setImmediate(resolve))
    screen.cleanup()
  })

  it('keeps cursor-only updates on the requested full-screen row', async () => {
    const stdin = new InputStream()
    const target = new CaptureStream()
    Object.assign(target, { rows: 4 })
    const output = createTerminalOutput(target as unknown as NodeJS.WriteStream)
    const screen = render(
      React.createElement(CursorFrame, { rows: target.rows, cursorRow: 2 }),
      inkLive(stdin, output),
    )

    await screen.waitUntilRenderFlush()
    screen.rerender(React.createElement(CursorFrame, { rows: target.rows, cursorRow: 1 }))
    await screen.waitUntilRenderFlush()

    expect(terminalCursorPosition(target.value)).toEqual({ row: 1, column: 2 })

    screen.unmount()
    await new Promise<void>((resolve) => setImmediate(resolve))
    screen.cleanup()
  })

  it('does not adjust cursor-only updates for a non-full-screen frame', async () => {
    const stdin = new InputStream()
    const target = new CaptureStream()
    Object.assign(target, { rows: 4 })
    const output = createTerminalOutput(target as unknown as NodeJS.WriteStream)
    const screen = render(
      React.createElement(CursorFrame, { rows: 3, cursorRow: 1 }),
      inkLive(stdin, output),
    )

    await screen.waitUntilRenderFlush()
    screen.rerender(React.createElement(CursorFrame, { rows: 3, cursorRow: 0 }))
    await screen.waitUntilRenderFlush()

    expect(terminalCursorPosition(target.value)).toEqual({ row: 0, column: 2 })

    screen.unmount()
    await new Promise<void>((resolve) => setImmediate(resolve))
    screen.cleanup()
  })

  it('redraws absolutely when a hardware-cursor frame becomes a running frame', async () => {
    const stdin = new InputStream()
    const target = new CaptureStream()
    Object.assign(target, { rows: 4 })
    const output = createTerminalOutput(target as unknown as NodeJS.WriteStream)
    const screen = render(
      React.createElement(CursorFrame, { rows: target.rows, cursorRow: 2, bottom: 'DRAFT' }),
      inkLive(stdin, output),
    )

    await screen.waitUntilRenderFlush()
    const beforeSend = target.value.length
    screen.rerender(React.createElement(CursorFrame, { rows: target.rows, bottom: 'RUNNING' }))
    await screen.waitUntilRenderFlush()

    const redraw = target.value.slice(beforeSend)
    expect(redraw).toContain('\u001b[H\u001b[J')
    expect(redraw).not.toContain('\u001b[2K')
    expect(redraw).toContain('\u001b[?25l')

    screen.unmount()
    await new Promise<void>((resolve) => setImmediate(resolve))
    screen.cleanup()
  })

  it('uses an absolute clear when a full-screen frame is redrawn', () => {
    const target = new CaptureStream()
    Object.assign(target, { columns: 20, rows: 4 })
    const output = createTerminalOutput(target as unknown as NodeJS.WriteStream)

    output.write('[old]\nline two\nline three\nlast')
    const beforeRedraw = target.value.length
    output.write(
      '\u001b[?25l\u001b[2B\u001b[1G' +
        '\u001b[2K\u001b[1A'.repeat(3) +
        '\u001b[2K\u001b[G' +
        'new\nline two\nline three\nlast',
    )

    const redraw = target.value.slice(beforeRedraw)
    expect(redraw).toBe('\u001b[?25l\u001b[H\u001b[Jnew\nline two\nline three\nlast')
    expect(redraw).not.toContain('\u001b[2K')
  })

  it('reports the real viewport height to Ink', () => {
    const target = new CaptureStream()
    Object.assign(target, { rows: 24 })
    const output = createTerminalOutput(target as unknown as NodeJS.WriteStream)

    expect(output.rows).toBe(24)
  })

  it('reserves one column for Ink so full-width frames do not auto-wrap', () => {
    const target = new CaptureStream()
    Object.assign(target, { columns: 120, rows: 30 })
    const output = createTerminalOutput(target as unknown as NodeJS.WriteStream)

    expect(output.columns).toBe(119)
    expect(output.cocodeTerminalColumns).toBe(120)
  })
})

function inkLive(stdin: InputStream, stdout: NodeJS.WriteStream) {
  return {
    stdin: stdin as unknown as NodeJS.ReadStream,
    stdout,
    patchConsole: false,
    exitOnCtrlC: false,
    // CI/GITHUB_ACTIONS makes Ink defer frames until unmount.
    interactive: true,
  }
}

class CaptureStream extends Writable {
  readonly isTTY = true
  value = ''
  columns = 80
  rows = 24

  _write(chunk: Buffer | string, _encoding: BufferEncoding, callback: () => void): void {
    this.value += chunk.toString()
    callback()
  }
}

class InputStream extends PassThrough {
  readonly isTTY = true
  isRaw = false

  setRawMode(value: boolean): this {
    this.isRaw = value
    return this
  }

  ref(): this {
    return this
  }

  unref(): this {
    return this
  }
}

function CursorFrame(props: { rows: number; cursorRow?: number; bottom?: string }) {
  const { setCursorPosition } = useCursor()
  setCursorPosition(props.cursorRow === undefined ? undefined : { x: 2, y: props.cursorRow })
  return React.createElement(
    Box,
    { flexDirection: 'column', height: props.rows },
    React.createElement(Text, null, 'FRAME-TOP'),
    React.createElement(Box, { flexGrow: 1 }),
    React.createElement(Text, null, props.bottom ?? 'FRAME-BOTTOM'),
  )
}

function terminalCursorPosition(output: string): { row: number; column: number } {
  let row = 0
  let column = 0
  let index = 0

  while (index < output.length) {
    const escape = /^\u001b\[([0-9;?]*)([A-Za-z])/.exec(output.slice(index))
    if (escape !== null) {
      const amount = Number.parseInt(escape[1] ?? '', 10) || 1
      switch (escape[2]) {
        case 'A':
          row = Math.max(0, row - amount)
          break
        case 'B':
          row += amount
          break
        case 'G':
          column = amount - 1
          break
        case 'H': {
          const [targetRow = '1', targetColumn = '1'] = (escape[1] ?? '').split(';')
          row = (Number.parseInt(targetRow, 10) || 1) - 1
          column = (Number.parseInt(targetColumn, 10) || 1) - 1
          break
        }
      }
      index += escape[0].length
      continue
    }

    if (output[index] === '\n') {
      row += 1
      column = 0
    } else if (output[index] !== '\r') {
      column += 1
    }
    index += 1
  }

  return { row, column }
}
