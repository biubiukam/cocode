import { PassThrough, Writable } from 'node:stream'
import React from 'react'
import { render } from 'ink'
import { describe, expect, it, vi } from 'vitest'
import type {
  TuiApprovalAnswer,
  TuiApprovalRequest,
  TuiCapabilities,
  TuiNotification,
  TuiPluginEntry,
  TuiQuestionAnswer,
  TuiQuestionRequest,
  TuiRuntime,
} from '@cocode/tui-connection'
import { Chat } from '../../src/present/chat.tsx'
import { createTuiApp } from '../../src/runtime/app.ts'
import { P0_CAPABILITIES } from '../../src/runtime/capabilities.ts'
import { DEFAULT_BINDINGS, type Keymap } from '../../src/runtime/keymap.ts'

describe('Chat', () => {
  it('enables Kitty keyboard protocol without probing the terminal', async () => {
    const runtime = createTestRuntime()
    const chat = await renderChat(runtime.value, { startBeforeRender: true })

    try {
      expect(chat.stdout.output).toContain('\u001B[>1u')
      expect(chat.stdout.output).not.toContain('\u001B[?u')
    } finally {
      await closeChat(chat)
    }
  })

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

  it.each([80, 120])(
    'uses Ctrl+O for the selected assistant without changing global verbose at %i columns',
    async (columns) => {
    const runtime = createTestRuntime()
    const keymap: Keymap = {
      ...DEFAULT_BINDINGS,
      'messages.select': [{ key: 'u', ctrl: true, alt: false, shift: false }],
    }
    const chat = await renderChat(runtime.value, { startBeforeRender: true, keymap, columns })

    try {
      await renderFlush()
      runtime.emit({
        method: 'session.event',
        params: {
          sessionId: 'session-1',
          event: {
            type: 'assistant/message',
            seq: 1,
            time: 1,
            data: {
              turn: 1,
              step: 0,
              message: {
                id: 'assistant-1',
                role: 'assistant',
                content: [
                  { type: 'reasoning', text: 'private reasoning detail' },
                  { type: 'text', text: 'Done.' },
                ],
                source: { kind: 'model', provider: 'test-provider', model: 'test-model' },
              },
              usage: { inputTokens: 5, outputTokens: 1 },
            },
          },
        },
      })
      await expect.poll(() => chat.app.snapshot().nodes.length).toBe(1)
      await renderFlush()

      chat.stdin.write('\u0015')
      await renderFlush()
      expect(plainOutput(chat.stdout.output)).toContain('Ctrl+O or enter expand details')

      chat.stdout.output = ''
      chat.stdin.write('\u000f')
      await renderFlush()

      expect(chat.app.snapshot().verbose).toBe(false)
      expect(plainOutput(chat.stdout.output)).toContain('private reasoning detail')
      expect(plainOutput(chat.stdout.output)).toContain('Ctrl+O or enter collapse details')

      chat.stdin.write('\u001b')
      await renderFlush()
      expect(chat.app.snapshot().verbose).toBe(false)
      chat.stdin.write('\u000f')
      await renderFlush()
      expect(chat.app.snapshot().verbose).toBe(true)
    } finally {
      await closeChat(chat)
    }
    },
  )

  it('does not invent details for a selected user and projects the configured shortcut', async () => {
    const runtime = createTestRuntime()
    const keymap: Keymap = {
      ...DEFAULT_BINDINGS,
      'messages.select': [{ key: 'u', ctrl: true, alt: false, shift: false }],
      'transcript.toggleVerbose': [
        { key: 'k', ctrl: true, alt: false, shift: false },
      ],
    }
    const chat = await renderChat(runtime.value, { startBeforeRender: true, keymap })

    try {
      await renderFlush()
      runtime.emit({
        method: 'session.event',
        params: {
          sessionId: 'session-1',
          event: {
            type: 'user/message',
            seq: 1,
            time: 1,
            data: {
              id: 'user-1',
              role: 'user',
              content: [{ type: 'text', text: 'hello' }],
              source: { kind: 'user' },
            },
          },
        },
      })
      runtime.emit({
        method: 'session.event',
        params: {
          sessionId: 'session-1',
          event: {
            type: 'user/message',
            seq: 2,
            time: 2,
            data: {
              id: 'user-2',
              role: 'user',
              content: [{ type: 'text', text: 'current prompt' }],
              source: { kind: 'user' },
            },
          },
        },
      })
      await expect.poll(() => chat.app.snapshot().nodes.length).toBe(2)
      await renderFlush()
      chat.stdin.write('\u0015')
      await renderFlush()

      const selectedOutput = plainOutput(chat.stdout.output)
      expect(selectedOutput).toContain('M actions')
      expect(selectedOutput).not.toContain('expand details')
      expect(selectedOutput).not.toContain('collapse details')

      chat.stdout.output = ''
      chat.stdin.write('\u000b')
      await renderFlush()

      expect(chat.app.snapshot().verbose).toBe(false)

      chat.stdin.write('\u001b')
      await renderFlush()
      chat.stdin.write('\u000b')
      await renderFlush()
      expect(chat.app.snapshot().verbose).toBe(true)
    } finally {
      await closeChat(chat)
    }
  })

  it('clears selected and expanded message presentation state on session switch', async () => {
    const runtime = createTestRuntime()
    const keymap: Keymap = {
      ...DEFAULT_BINDINGS,
      'messages.select': [{ key: 'u', ctrl: true, alt: false, shift: false }],
    }
    const chat = await renderChat(runtime.value, { startBeforeRender: true, keymap })

    try {
      await renderFlush()
      runtime.emit({
        method: 'session.event',
        params: {
          sessionId: 'session-1',
          event: {
            type: 'assistant/message',
            seq: 1,
            time: 1,
            data: {
              turn: 1,
              step: 0,
              message: {
                id: 'assistant-1',
                role: 'assistant',
                content: [
                  { type: 'reasoning', text: 'session-only detail' },
                  { type: 'text', text: 'Done.' },
                ],
                source: { kind: 'model', provider: 'test-provider', model: 'test-model' },
              },
            },
          },
        },
      })
      await expect.poll(() => chat.app.snapshot().nodes.length).toBe(1)
      await renderFlush()
      chat.stdin.write('\u0015')
      await renderFlush()
      chat.stdin.write('\u000f')
      await renderFlush()
      expect(plainOutput(chat.stdout.output)).toContain('session-only detail')

      chat.stdout.output = ''
      chat.app.dispatch({ type: 'session.new' })
      await expect.poll(() => chat.app.snapshot().header.sessionId).not.toBe('session-1')
      await renderFlush()

      expect(chat.app.snapshot().nodes).toHaveLength(0)
      expect(plainOutput(chat.stdout.output)).not.toContain('session-only detail')
      expect(plainOutput(chat.stdout.output)).not.toContain('collapse details')
    } finally {
      await closeChat(chat)
    }
  })

  it('blocks Ctrl+O across model, approval, question, review, and rewind overlays', async () => {
    const runtime = createTestRuntime()
    const chat = await renderChat(runtime.value, {
      startBeforeRender: true,
      capabilities: { ...P0_CAPABILITIES, approval: true },
    })

    try {
      await renderFlush()

      const approvalAnswer = runtime.requestApproval({
        sessionId: 'session-1',
        toolName: 'write_file',
        reason: 'test overlay routing',
      })
      await expect.poll(() => chat.app.snapshot().approval?.open).toBe(true)
      await renderFlush()
      chat.stdin.write('\u000f')
      await renderFlush()
      expect(chat.app.snapshot().verbose).toBe(false)
      chat.app.dispatch({ type: 'approval.cancel' })
      await approvalAnswer

      const questionAnswer = runtime.askQuestion({
        sessionId: 'session-1',
        questions: [{ id: 'choice', question: 'Continue?' }],
      })
      await expect.poll(() => chat.app.snapshot().question).toBeDefined()
      await renderFlush()
      chat.stdin.write('\u000f')
      await renderFlush()
      expect(chat.app.snapshot().verbose).toBe(false)
      chat.app.dispatch({ type: 'question.cancel' })
      await expect(questionAnswer).rejects.toThrow('interrupted')

      chat.app.dispatch({ type: 'command', line: '/review' })
      await expect.poll(() => chat.app.snapshot().reviewPicker?.open).toBe(true)
      await renderFlush()
      chat.stdin.write('\u000f')
      await renderFlush()
      expect(chat.app.snapshot().verbose).toBe(false)
      chat.app.dispatch({ type: 'review.close' })

      runtime.emit({
        method: 'session.event',
        params: {
          sessionId: 'session-1',
          event: {
            type: 'user/message',
            seq: 1,
            time: 1,
            data: {
              id: 'user-1',
              role: 'user',
              content: [{ type: 'text', text: 'rewind target' }],
              source: { kind: 'user' },
            },
          },
        },
      })
      runtime.emit({
        method: 'session.event',
        params: {
          sessionId: 'session-1',
          event: {
            type: 'user/message',
            seq: 2,
            time: 2,
            data: {
              id: 'user-2',
              role: 'user',
              content: [{ type: 'text', text: 'current prompt' }],
              source: { kind: 'user' },
            },
          },
        },
      })
      await expect.poll(() => chat.app.snapshot().nodes.length).toBe(2)
      chat.app.dispatch({ type: 'rewind.open' })
      await expect.poll(() => chat.app.snapshot().rewindPicker?.open).toBe(true)
      await renderFlush()
      chat.stdin.write('\u000f')
      await renderFlush()
      expect(chat.app.snapshot().verbose).toBe(false)
      chat.app.dispatch({ type: 'rewind.close' })

      chat.app.dispatch({ type: 'model.open' })
      await expect.poll(() => chat.app.snapshot().modelInputOpen).toBe(true)
      await renderFlush()
      chat.stdin.write('\u000f')
      await renderFlush()
      expect(chat.app.snapshot().verbose).toBe(false)
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
  requestApproval: (request: TuiApprovalRequest) => Promise<TuiApprovalAnswer>
  askQuestion: (request: TuiQuestionRequest) => Promise<TuiQuestionAnswer>
} {
  const handlers = new Set<(notification: TuiNotification) => void>()
  const plugins = options.plugins ?? []
  let approvalHandler: ((request: TuiApprovalRequest) => Promise<TuiApprovalAnswer>) | undefined
  let questionHandler: ((request: TuiQuestionRequest) => Promise<TuiQuestionAnswer>) | undefined
  const emit = (notification: TuiNotification): void => {
    for (const handler of handlers) handler(notification)
  }
  return {
    emit,
    plugins,
    requestApproval(request) {
      if (approvalHandler === undefined) throw new Error('approval handler unavailable')
      return approvalHandler(request)
    },
    askQuestion(request) {
      if (questionHandler === undefined) throw new Error('question handler unavailable')
      return questionHandler(request)
    },
    value: {
      async start() {
        options.onStart?.(emit)
        return { name: 'test-runtime', version: '0' }
      },
      async prompt() {
        return 'message-1'
      },
      async cancel(sessionId) {
        return options.cancel?.(sessionId) ?? true
      },
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
      onApproval(handler) {
        approvalHandler = handler
        return () => {
          if (approvalHandler === handler) approvalHandler = undefined
        }
      },
      onQuestion(handler) {
        questionHandler = handler
        return () => {
          if (questionHandler === handler) questionHandler = undefined
        }
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
    keymap?: Keymap
    columns?: number
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
  const stdout = new CaptureStream(options.columns ?? 100, 30)
  const screen = render(React.createElement(Chat, {
    app,
    keymap: options.keymap,
    mouseSupported: false,
  }), {
    stdin: stdin as unknown as NodeJS.ReadStream,
    stdout: stdout as unknown as NodeJS.WriteStream,
    debug: true,
    patchConsole: false,
    exitOnCtrlC: false,
    kittyKeyboard: { mode: 'enabled' },
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
