import { PassThrough, Writable } from 'node:stream'
import React from 'react'
import { render } from 'ink'
import { describe, expect, it, vi } from 'vitest'
import type {
  TuiCapabilities,
  TuiNotification,
  TuiPluginEntry,
  TuiRuntime,
} from '@cocode/tui-connection'
import { Chat } from '../../src/present/chat.tsx'
import { createTuiApp } from '../../src/runtime/app.ts'
import { P0_CAPABILITIES } from '../../src/runtime/capabilities.ts'

describe('Chat', () => {
  it('shows a quit confirmation for the first idle Ctrl+C', async () => {
    const runtime = createTestRuntime()
    const chat = await renderChat(runtime.value, { locale: 'en', startBeforeRender: true })

    try {
      chat.stdin.write('\u0003')
      await renderFlush()

      expect(chat.app.snapshot().quitConfirmation).toBe(true)
      expect(chat.app.snapshot().quitConfirmationSelection).toBe('confirm')
      expect(plainOutput(chat.stdout.output)).toContain('Are you sure you want to quit?')

      chat.stdin.write('\u001B[C')
      await renderFlush()
      expect(chat.app.snapshot().quitConfirmationSelection).toBe('cancel')

      chat.stdin.write('\u001B')
      await renderFlush()
      expect(chat.app.snapshot().quitConfirmation).toBe(false)

      chat.stdin.write('\u0003')
      await renderFlush()
      chat.stdin.write('\r')
      await renderFlush()
      expect(chat.app.snapshot().exiting).toBe(true)
    } finally {
      await closeChat(chat)
    }
  })

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
      await renderFlush()
      chat.stdin.write('\u001B')
      await renderFlush()

      expect(cancel).toHaveBeenCalledWith('session-1')
    } finally {
      await closeChat(chat)
    }
  })

  it('routes Kitty super shortcuts to the composer', async () => {
    const runtime = createTestRuntime()
    const chat = await renderChat(runtime.value, { startBeforeRender: true })

    try {
      chat.app.dispatch({ type: 'setDraft', text: 'hello' })
      await renderFlush()
      chat.stdin.write('\u001B[97;9u')
      await renderFlush()

      expect(chat.app.snapshot().composer.selection).toEqual({ start: 0, end: 5 })
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
      await expect.poll(() => plainOutput(chat.stdout.output)).toContain('cocode is ready')
      chat.stdout.output = ''

      await chat.app.start()
      await renderFlush()

      expect(chat.app.snapshot().status.line).toBe('ready')
      expect(plainOutput(chat.stdout.output)).toContain('cocode is ready')
    } finally {
      await closeChat(chat)
    }
  })

  it('filters the plugin menu and toggles the selected entry without closing it', async () => {
    const runtime = createTestRuntime({
      plugins: [
        { entryId: 'vision', moduleName: '@cocode/vision', enabled: true, fiberPhase: 'active' },
        { entryId: 'legacy', moduleName: '@deepseek-ai/dsh-legacy', enabled: false, fiberPhase: null },
      ],
    })
    const chat = await renderChat(runtime.value, {
      locale: 'en',
      capabilities: { ...P0_CAPABILITIES, plugins: true, pluginsMutate: true },
      startBeforeRender: true,
    })

    try {
      chat.app.dispatch({ type: 'command', line: '/plugins' })
      await expect.poll(() => chat.app.snapshot().pluginPicker?.open).toBe(true)
      await renderFlush()
      chat.app.dispatch({ type: 'plugins.setQuery', query: 'legacy' })
      expect(chat.app.snapshot().pluginPicker?.query).toBe('legacy')
      chat.app.dispatch({ type: 'plugins.confirm' })
      await expect.poll(() => runtime.plugins[1]?.enabled).toBe(true)
      expect(chat.app.snapshot().pluginPicker?.open).toBe(true)
      expect(plainOutput(chat.stdout.output)).toContain('Runtime plugins')
    } finally {
      await closeChat(chat)
    }
  })

  it('routes arrow keys to the permission picker instead of history', async () => {
    const runtime = createTestRuntime()
    let currentMode = 'manual'
    runtime.value.permissionMode = async (_sessionId, mode) => {
      if (mode !== undefined) currentMode = mode
      return { mode: currentMode, supportedModes: ['manual', 'workspace-write', 'allow-all'] }
    }
    const chat = await renderChat(runtime.value, {
      capabilities: { ...P0_CAPABILITIES, permissionMode: true },
      startBeforeRender: true,
    })

    try {
      await flush()
      chat.app.dispatch({ type: 'command', line: '/permission' })
      await expect.poll(() => chat.app.snapshot().permissionPicker?.open).toBe(true)
      await renderFlush()
      expect(chat.app.snapshot().permissionPicker?.selected).toBe(0)

      chat.stdin.write('\u001B[B')
      await renderFlush()
      expect(chat.app.snapshot().permissionPicker?.selected).toBe(1)
      expect(chat.app.snapshot().composer.text).toBe('')

      chat.stdin.write('\u001B[A')
      await renderFlush()
      expect(chat.app.snapshot().permissionPicker?.selected).toBe(0)
    } finally {
      await closeChat(chat)
    }
  })
})

function createTestRuntime(options: {
  cancel?: (sessionId: string) => Promise<boolean>
  onStart?: (emit: (notification: TuiNotification) => void) => void
  plugins?: TuiPluginEntry[]
  } = {}): {
  value: TuiRuntime
  emit: (notification: TuiNotification) => void
  plugins: TuiPluginEntry[]
} {
  const handlers = new Set<(notification: TuiNotification) => void>()
  const plugins = options.plugins ?? []
  const emit = (notification: TuiNotification): void => {
    for (const handler of handlers) handler(notification)
  }
  return {
    emit,
    plugins,
    value: {
      async start() {
        options.onStart?.(emit)
        return { name: 'test-runtime', version: '0' }
      },
      async prompt() {
        return 'message-1'
      },
      ...(options.cancel === undefined ? {} : { cancel: options.cancel }),
      async listPlugins() {
        return plugins
      },
      async setPluginEnabled(entryId: string, enabled: boolean) {
        const index = plugins.findIndex((plugin) => plugin.entryId === entryId)
        const plugin = plugins[index]
        if (plugin === undefined) throw new Error(`plugin entry not found: ${entryId}`)
        const updated = { ...plugin, enabled, fiberPhase: enabled ? 'active' : null } as TuiPluginEntry
        plugins[index] = updated
        return updated
      },
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
  options: {
    locale?: 'en' | 'zh'
    startBeforeRender?: boolean
    capabilities?: TuiCapabilities
  } = {},
) {
  const app = createTuiApp({
    runtime,
    cwd: '/tmp',
    provider: 'test-provider',
    model: 'test-model',
    sessionId: 'session-1',
    locale: options.locale,
    capabilities: options.capabilities,
  })
  if (options.startBeforeRender === true) await app.start()
  const stdin = new InputStream()
  const stdout = new CaptureStream(100, 30)
  const screen = render(React.createElement(Chat, { app, mouseSupported: false }), {
    stdin: stdin as unknown as NodeJS.ReadStream,
    stdout: stdout as unknown as NodeJS.WriteStream,
    debug: true,
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
