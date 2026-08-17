import { PassThrough, Writable } from 'node:stream'
import React from 'react'
import { render } from 'ink'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApprovalPanel } from '../../src/present/components/ApprovalPanel.tsx'

describe('ApprovalPanel leftover pointer', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not auto-answer a leftover mouse press after the ready delay', async () => {
    vi.useFakeTimers({
      toFake: [
        'Date',
        'setInterval',
        'clearInterval',
        'setTimeout',
        'clearTimeout',
      ],
    })
    const dispatch = vi.fn()
    const leftover = { id: 9, row: 9, action: 'press' as const }
    const app = render(
      React.createElement(ApprovalPanel, {
        state: {
          open: true,
          request: {
            sessionId: 'session-1',
            toolName: 'bash',
            callId: 'call-1',
            target: 'ls',
          },
        },
        locale: 'en',
        panelStartRow: 1,
        mousePointer: leftover,
        dispatch,
      }),
      {
        stdin: new InputStream() as unknown as NodeJS.ReadStream,
        stdout: new CaptureStream(80, 24) as unknown as NodeJS.WriteStream,
        patchConsole: false,
        exitOnCtrlC: false,
      },
    )

    await vi.advanceTimersByTimeAsync(800)
    await flush()
    expect(dispatch).not.toHaveBeenCalled()

    app.rerender(
      React.createElement(ApprovalPanel, {
        state: {
          open: true,
          request: {
            sessionId: 'session-1',
            toolName: 'bash',
            callId: 'call-1',
            target: 'ls',
          },
        },
        locale: 'en',
        panelStartRow: 1,
        mousePointer: { id: 10, row: 9, action: 'press' },
        dispatch,
      }),
    )
    await flush()
    expect(dispatch).toHaveBeenCalledWith({
      type: 'approval.answer',
      outcome: 'allowed-once',
    })

    app.unmount()
    await flush()
    app.cleanup()
  })
})

function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
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

class CaptureStream extends Writable {
  readonly isTTY = true
  output = ''
  constructor(readonly columns: number, readonly rows: number) {
    super()
  }
  override _write(
    chunk: Buffer | string,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.output += chunk.toString()
    callback()
  }
}
