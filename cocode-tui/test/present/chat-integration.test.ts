import { PassThrough, Writable } from 'node:stream'
import React from 'react'
import { render } from 'ink'
import { describe, expect, it, vi } from 'vitest'
import type { TuiNotification, TuiRuntime } from '@cocode/tui-connection'
import { Chat } from '../../src/present/chat.tsx'
import { createTuiApp } from '../../src/runtime/app.ts'

describe('Chat', () => {
  it('sends session cancellation when Esc is pressed during a running turn', async () => {
    const handlers = new Set<(notification: TuiNotification) => void>()
    const cancel = vi.fn(async () => true)
    const runtime: TuiRuntime = {
      async start() {
        return { name: 'test-runtime', version: '0' }
      },
      async prompt() {
        return 'message-1'
      },
      cancel,
      subscribe(handler) {
        handlers.add(handler)
        return () => handlers.delete(handler)
      },
      async close() {},
    }
    const app = createTuiApp({
      runtime,
      cwd: '/tmp',
      provider: 'test-provider',
      model: 'test-model',
      sessionId: 'session-1',
    })
    await app.start()
    for (const handler of handlers) {
      handler({
        method: 'session.status',
        params: { sessionId: 'session-1', status: 'running' },
      })
    }

    const stdin = new InputStream()
    const stdout = new CaptureStream(100, 30)
    const screen = render(React.createElement(Chat, { app, mouseSupported: false }), {
      stdin: stdin as unknown as NodeJS.ReadStream,
      stdout: stdout as unknown as NodeJS.WriteStream,
      patchConsole: false,
      exitOnCtrlC: false,
    })

    await flush()
    stdin.write('\u001B')
    await flush()

    expect(cancel).toHaveBeenCalledWith('session-1')

    screen.unmount()
    await flush()
    screen.cleanup()
    await app.close()
  })

  it('keeps the main logo after initialization becomes ready', async () => {
    const handlers = new Set<(notification: TuiNotification) => void>()
    const runtime: TuiRuntime = {
      async start() {
        for (const handler of handlers) {
          handler({
            method: 'session.event',
            params: {
              sessionId: 'session-1',
              event: { type: 'turn/start', seq: 1, time: 1, data: { turn: 1 } },
            },
          })
        }
        return { name: 'test-runtime', version: '0' }
      },
      async prompt() {
        return 'message-1'
      },
      subscribe(handler) {
        handlers.add(handler)
        return () => handlers.delete(handler)
      },
      async close() {},
    }
    const app = createTuiApp({
      runtime,
      cwd: '/tmp',
      provider: 'test-provider',
      model: 'test-model',
      sessionId: 'session-1',
      locale: 'en',
    })
    const stdin = new InputStream()
    const stdout = new CaptureStream(100, 30)
    const screen = render(React.createElement(Chat, { app, mouseSupported: false }), {
      stdin: stdin as unknown as NodeJS.ReadStream,
      stdout: stdout as unknown as NodeJS.WriteStream,
      patchConsole: false,
      exitOnCtrlC: false,
    })

    try {
      await flush()
      expect(plainOutput(stdout.output)).toContain('cocode is ready')
      stdout.output = ''

      await app.start()
      await renderFlush()

      expect(app.snapshot().status.line).toBe('ready')
      expect(plainOutput(stdout.output)).toContain('cocode is ready')
    } finally {
      screen.unmount()
      await flush()
      screen.cleanup()
      await app.close()
    }
  })
})

function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

function renderFlush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 50))
}

function plainOutput(output: string): string {
  return output.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
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

  constructor(
    readonly columns: number,
    readonly rows: number,
  ) {
    super()
  }

  _write(chunk: Buffer | string, _encoding: BufferEncoding, callback: () => void): void {
    this.output += chunk.toString()
    callback()
  }
}
