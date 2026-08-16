import { PassThrough, Writable } from 'node:stream'
import React from 'react'
import { render } from 'ink'
import { describe, expect, it, vi } from 'vitest'
import type { TuiNotification, TuiRuntime } from '@cocode/tui-connection'
import { Chat } from '../../src/present/chat.tsx'
import { createTuiApp } from '../../src/runtime/app.ts'

describe('Chat', () => {
  it('sends session cancellation when Esc is pressed during a running turn', async () => {
    const cancel = vi.fn(async () => true)
    const runtime = createTestRuntime({ cancel })
    const chat = await renderChat(runtime.value, { startBeforeRender: true })

    try {
      runtime.emit({
        method: 'session.status',
        params: { sessionId: 'session-1', status: 'running' },
      })

      await flush()
      chat.stdin.write('\u001B')
      await flush()

      expect(cancel).toHaveBeenCalledWith('session-1')
    } finally {
      await closeChat(chat)
    }
  })

  it('keeps the main logo after initialization becomes ready', async () => {
    const runtime = createTestRuntime({
      onStart: (emit) => {
        emit({
          method: 'session.event',
          params: {
            sessionId: 'session-1',
            event: { type: 'turn/start', seq: 1, time: 1, data: { turn: 1 } },
          },
        })
      },
    })
    const chat = await renderChat(runtime.value, { locale: 'en' })

    try {
      await flush()
      expect(plainOutput(chat.stdout.output)).toContain('cocode is ready')
      chat.stdout.output = ''

      await chat.app.start()
      await renderFlush()

      expect(chat.app.snapshot().status.line).toBe('ready')
      expect(plainOutput(chat.stdout.output)).toContain('cocode is ready')
    } finally {
      await closeChat(chat)
    }
  })
})

function createTestRuntime(options: {
  cancel?: (sessionId: string) => Promise<boolean>
  onStart?: (emit: (notification: TuiNotification) => void) => void
} = {}): { value: TuiRuntime; emit: (notification: TuiNotification) => void } {
  const handlers = new Set<(notification: TuiNotification) => void>()
  const emit = (notification: TuiNotification): void => {
    for (const handler of handlers) handler(notification)
  }
  return {
    emit,
    value: {
      async start() {
        options.onStart?.(emit)
        return { name: 'test-runtime', version: '0' }
      },
      async prompt() {
        return 'message-1'
      },
      ...(options.cancel === undefined ? {} : { cancel: options.cancel }),
      subscribe(handler) {
        handlers.add(handler)
        return () => handlers.delete(handler)
      },
      async close() {},
    },
  }
}

async function renderChat(
  runtime: TuiRuntime,
  options: { locale?: 'en' | 'zh'; startBeforeRender?: boolean } = {},
) {
  const app = createTuiApp({
    runtime,
    cwd: '/tmp',
    provider: 'test-provider',
    model: 'test-model',
    sessionId: 'session-1',
    locale: options.locale,
  })
  if (options.startBeforeRender === true) await app.start()
  const stdin = new InputStream()
  const stdout = new CaptureStream(100, 30)
  const screen = render(React.createElement(Chat, { app, mouseSupported: false }), {
    stdin: stdin as unknown as NodeJS.ReadStream,
    stdout: stdout as unknown as NodeJS.WriteStream,
    patchConsole: false,
    exitOnCtrlC: false,
  })
  return { app, stdin, stdout, screen }
}

async function closeChat(chat: Awaited<ReturnType<typeof renderChat>>): Promise<void> {
  chat.screen.unmount()
  await flush()
  chat.screen.cleanup()
  await chat.app.close()
}

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
