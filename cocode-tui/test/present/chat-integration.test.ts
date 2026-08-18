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
import { createTerminalOutput } from '../../src/present/terminal-output.ts'
import { createTuiApp } from '../../src/runtime/app.ts'
import { P0_CAPABILITIES } from '../../src/runtime/capabilities.ts'
import { DEFAULT_BINDINGS, type Keymap } from '../../src/runtime/keymap.ts'

describe('Chat', () => {
  it('captures wheel input in the default transcript', async () => {
    const runtime = createTestRuntime()
    const chat = await renderChat(runtime.value, {
      startBeforeRender: true,
      mouseSupported: true,
      columns: 100,
      rows: 24,
    })

    try {
      emitUserMessages(runtime, 18)
      await expect.poll(() => chat.app.snapshot().nodes.length).toBe(18)
      await expect
        .poll(() => latestPlainLines(chat.stdout.output).join('\n'))
        .toContain('message-17')
      expect(latestPlainLines(chat.stdout.output).join('\n')).not.toContain(
        'message-0',
      )

      chat.stdout.output = ''
      for (let tick = 0; tick < 12; tick += 1) {
        chat.stdin.write('\u001b[<64;10;10M')
        await renderFlush()
        if (
          latestPlainLines(chat.stdout.output).join('\n').includes('message-0')
        ) {
          break
        }
      }
      expect(latestPlainLines(chat.stdout.output).join('\n')).toContain(
        'message-0',
      )
    } finally {
      await closeChat(chat)
    }
  })

  it('does not open the command menu below the ready status', async () => {
    const runtime = createTestRuntime()
    const chat = await renderChat(runtime.value, {
      startBeforeRender: true,
      mouseSupported: true,
      columns: 100,
      rows: 24,
    })

    try {
      await expect
        .poll(() =>
          latestPlainLines(chat.stdout.output).findIndex((line) =>
            line.includes('ready'),
          ),
        )
        .toBeGreaterThanOrEqual(0)
      const readyRow = latestPlainLines(chat.stdout.output).findIndex((line) =>
        line.includes('ready'),
      ) + 1

      chat.stdin.write(`\u001b[<0;4;${readyRow + 1}M`)
      await renderFlush()

      expect(latestPlainLines(chat.stdout.output).join('\n')).not.toContain(
        'Command menu',
      )
    } finally {
      await closeChat(chat)
    }
  })

  it('scrolls a plan review preview with the mouse wheel', async () => {
    const runtime = createTestRuntime()
    const chat = await renderChat(runtime.value, {
      startBeforeRender: true,
      mouseSupported: true,
      columns: 100,
      rows: 40,
    })

    try {
      const detail = `# Plan\n\n${Array.from(
        { length: 40 },
        (_, index) => `- LINE-${String(index + 1).padStart(3, '0')}`,
      ).join('\n')}`
      const questionAnswer = runtime.askQuestion({
        sessionId: 'session-1',
        questions: [
          {
            id: 'review',
            question: 'Approve this plan and leave plan mode?',
            detail,
            options: [{ label: 'Approve' }, { label: 'Keep planning' }],
            intent: { kind: 'plan-review', approve: 'Approve' },
          },
        ],
      })
      questionAnswer.catch(() => undefined)
      await expect.poll(() => chat.app.snapshot().question).toBeDefined()
      await renderFlush()

      const before = plainOutput(chat.stdout.output)
      expect(before).toContain('LINE-001')
      expect(before).toContain('more')

      chat.stdout.output = ''
      chat.stdin.write('\u001b[<65;10;12M'.repeat(4))
      await renderFlush()

      const after = lastPaint(plainOutput(chat.stdout.output))
      expect(after).toContain('↑')
      expect(after).toContain('LINE-030')
      expect(after).not.toContain('LINE-001')
    } finally {
      if (chat.app.snapshot().question !== undefined) {
        chat.app.dispatch({ type: 'question.cancel' })
      }
      await closeChat(chat)
    }
  })

  it('selects character ranges across messages and copies their text', async () => {
    const runtime = createTestRuntime()
    const chat = await renderChat(runtime.value, {
      startBeforeRender: true,
      mouseSupported: true,
      columns: 100,
    })

    try {
      emitUserMessages(runtime, 3, '')
      await expect.poll(() => chat.app.snapshot().nodes.length).toBe(3)
      await renderFlush()

      chat.stdin.write('\u001b[<0;3;4M\u001b[<32;12;8M\u001b[<0;12;8m')
      await renderFlush()
      expect(plainOutput(chat.stdout.output)).toContain('↑↓ move')
      expect(plainOutput(chat.stdout.output)).toContain('Ctrl+C copy')

      const dispatch = vi
        .spyOn(chat.app, 'dispatch')
        .mockImplementation(() => undefined)
      chat.stdin.write('c')
      await renderFlush()

      expect(dispatch).toHaveBeenCalledWith({
        type: 'copyText',
        text: 'message-0\n\nmessage-1\n\nmessage-2',
      })
      dispatch.mockRestore()
    } finally {
      await closeChat(chat)
    }
  })

  it('copies a transcript selection with Ctrl+C instead of quitting', async () => {
    const runtime = createTestRuntime()
    const chat = await renderChat(runtime.value, {
      startBeforeRender: true,
      mouseSupported: true,
      columns: 100,
    })

    try {
      emitUserMessages(runtime, 3, '')
      await expect.poll(() => chat.app.snapshot().nodes.length).toBe(3)
      await renderFlush()

      chat.stdin.write('\u001b[<0;3;4M\u001b[<32;12;8M\u001b[<0;12;8m')
      await renderFlush()

      const dispatch = vi.spyOn(chat.app, 'dispatch')
      chat.stdin.write('\u0003')
      await renderFlush()

      expect(dispatch).toHaveBeenCalledWith({
        type: 'copyText',
        text: 'message-0\n\nmessage-1\n\nmessage-2',
      })
      expect(dispatch).not.toHaveBeenCalledWith({ type: 'interruptOrQuit' })
      expect(chat.app.snapshot().quitConfirmation).toBe(false)
      dispatch.mockRestore()
    } finally {
      await closeChat(chat)
    }
  })

  it('selects the same cross-message range when dragged from bottom to top', async () => {
    const runtime = createTestRuntime()
    const chat = await renderChat(runtime.value, {
      startBeforeRender: true,
      mouseSupported: true,
      columns: 100,
    })

    try {
      emitUserMessages(runtime, 3, '')
      await expect.poll(() => chat.app.snapshot().nodes.length).toBe(3)
      await renderFlush()

      chat.stdin.write('\u001b[<0;12;8M\u001b[<32;3;4M\u001b[<0;3;4m')
      await renderFlush()

      const dispatch = vi
        .spyOn(chat.app, 'dispatch')
        .mockImplementation(() => undefined)
      chat.stdin.write('c')
      await renderFlush()

      expect(dispatch).toHaveBeenCalledWith({
        type: 'copyText',
        text: 'message-0\n\nmessage-1\n\nmessage-2',
      })
      dispatch.mockRestore()
    } finally {
      await closeChat(chat)
    }
  })

  it('accepts drag motion encoded without a pressed button', async () => {
    const runtime = createTestRuntime()
    const chat = await renderChat(runtime.value, {
      startBeforeRender: true,
      mouseSupported: true,
      columns: 100,
    })

    try {
      emitUserMessages(runtime, 3, '')
      await expect.poll(() => chat.app.snapshot().nodes.length).toBe(3)
      await renderFlush()

      chat.stdin.write('\u001b[<0;3;4M\u001b[<35;12;8M\u001b[<0;12;8m')
      await renderFlush()

      const dispatch = vi
        .spyOn(chat.app, 'dispatch')
        .mockImplementation(() => undefined)
      chat.stdin.write('c')
      await renderFlush()

      expect(dispatch).toHaveBeenCalledWith({
        type: 'copyText',
        text: 'message-0\n\nmessage-1\n\nmessage-2',
      })
      dispatch.mockRestore()
    } finally {
      await closeChat(chat)
    }
  })

  it('copies visible thinking text from an assistant message', async () => {
    const runtime = createTestRuntime()
    const chat = await renderChat(runtime.value, {
      startBeforeRender: true,
      mouseSupported: true,
      columns: 100,
    })

    try {
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
                  { type: 'reasoning', text: 'thoughts' },
                  { type: 'text', text: 'answer' },
                ],
                source: {
                  kind: 'model',
                  provider: 'test-provider',
                  model: 'test-model',
                },
              },
            },
          },
        },
      })
      await expect.poll(() => chat.app.snapshot().nodes.length).toBe(1)
      await renderFlush()

      chat.stdin.write('\u001b[<0;3;4M\u001b[<32;11;4M\u001b[<0;11;4m')
      await renderFlush()

      const dispatch = vi
        .spyOn(chat.app, 'dispatch')
        .mockImplementation(() => undefined)
      chat.stdin.write('c')
      await renderFlush()

      expect(dispatch).toHaveBeenCalledWith({
        type: 'copyText',
        text: 'thoughts',
      })
      dispatch.mockRestore()
    } finally {
      await closeChat(chat)
    }
  })

  it('selects the painted tool line, not the thinking above it', async () => {
    const runtime = createTestRuntime()
    const chat = await renderChat(runtime.value, {
      startBeforeRender: true,
      mouseSupported: true,
      columns: 100,
    })

    try {
      emitUserMessages(runtime, 4, '')
      emitAssistantThinking(
        runtime,
        5,
        [
          'The user keeps saying hello repeatedly so I should just respond warmly and maybe offer to do something concrete instead of asking again.',
          "I shouldn't keep asking what they want if they are just saying hello.",
          'Actually, rather than asking again, let me just do something useful — check the current working directory.',
          'If that works I can list the files and then decide whether a snapshot is even needed.',
          'A browser snapshot is probably the wrong tool here, but I will try it anyway so the session moves forward.',
        ].join('\n'),
      )
      emitToolError(runtime, 6, 'c1', 'browser_snapshot')
      await expect.poll(() => chat.app.snapshot().nodes.length).toBe(6)
      await renderFlush()

      const lines = latestPlainLines(chat.stdout.output)
      const toolLine = lines.findIndex((line) =>
        line.includes('browser_snapshot'),
      )
      expect(toolLine, lines.join('\n')).toBeGreaterThan(0)

      const y = toolLine + 1
      chat.stdin.write(`\u001b[<0;4;${y}M\u001b[<32;40;${y}M\u001b[<0;40;${y}m`)
      await renderFlush()

      const dispatch = vi
        .spyOn(chat.app, 'dispatch')
        .mockImplementation(() => undefined)
      chat.stdin.write('c')
      await renderFlush()

      const copied = dispatch.mock.calls.find(
        (call) => call[0]?.type === 'copyText',
      )?.[0] as { type: string; text?: string } | undefined
      expect(copied?.text ?? '', lines.join('\n')).toContain('browser_snapshot')
      expect(copied?.text ?? '').not.toContain('warmly and maybe')
      dispatch.mockRestore()
    } finally {
      await closeChat(chat)
    }
  })

  it('keeps the status line off the last assistant body row', async () => {
    const runtime = createTestRuntime()
    const chat = await renderChat(runtime.value, {
      startBeforeRender: true,
      mouseSupported: true,
      columns: 80,
      rows: 24,
    })

    try {
      emitAssistantMessage(
        runtime,
        1,
        [
          "Wait, the tools available are only browser_act, browser_close, browser_open, browser_snapshot, browser_tabs. There's no shell/exec tool. So I can't explore the codebase directly.",
          '',
          'Hmm, maybe the harness will provide tools when needed. But right now I only have browser tools.',
          '',
          'Let me just be warm and clear.',
        ].join('\n'),
        [
          'Hi there! 😊',
          "I'm here and ready to help. Since you've said hello a few times, I want to make sure I'm being useful — what would you like to do with your cocode-tui project? For example:",
          '',
          '- Explain part of the codebase',
          '- Fix or implement something',
          '- Run tests or builds',
          '- Review recent changes',
          "Just let me know and I'll get started!",
        ].join('\n'),
      )
      await expect.poll(() => chat.app.snapshot().nodes.length).toBe(1)
      await renderFlush()

      const frame = latestPlainLines(chat.stdout.output).join('\n')
      expect(frame).toContain('ready')
      expect(frame).not.toMatch(/readyI'm being useful/)
      expect(frame).not.toMatch(/readyI'm/)
      const buildLine = frame
        .split('\n')
        .find((line) => line.includes('Build ·'))
      expect(buildLine, frame).toBeDefined()
      expect(buildLine).not.toMatch(/Explain|Review|Fix or implement/i)
    } finally {
      await closeChat(chat)
    }
  })

  it.each([
    [80, 24],
    [120, 30],
  ])(
    'keeps the hardware caret on the draft row after a reply is painted at %ix%i',
    async (columns, rows) => {
      const runtime = createTestRuntime()
      const app = createTuiApp({
        runtime: runtime.value,
        cwd: '/tmp',
        provider: 'test-provider',
        model: 'test-model',
        sessionId: 'session-1',
        locale: 'en',
        capabilities: P0_CAPABILITIES,
      })
      await app.start()
      const stdin = new InputStream()
      const target = new CaptureStream(columns, rows)
      const stdout = createTerminalOutput(
        target as unknown as NodeJS.WriteStream,
      )
      const screen = render(
        React.createElement(Chat, {
          app,
          mouseSupported: false,
          mouseInput: stdin,
          mouseOutput: stdout,
        }),
        {
          stdin: stdin as unknown as NodeJS.ReadStream,
          stdout,
          patchConsole: false,
          exitOnCtrlC: false,
          kittyKeyboard: { mode: 'enabled' },
          // CI/GITHUB_ACTIONS makes Ink defer frames until unmount.
          interactive: true,
        },
      )

      try {
        runtime.emit({
          method: 'session.event',
          params: {
            sessionId: 'session-1',
            event: {
              type: 'request/header',
              seq: 1,
              time: 1,
              data: {
                header: { config: { reasoningEffort: 'high' } },
              },
            },
          },
        })
        emitAssistantMessage(
          runtime,
          2,
          'The user said hello.',
          'Hello! How can I help?',
        )
        await expect.poll(() => app.snapshot().nodes.length).toBeGreaterThan(0)
        await expect
          .poll(() => app.snapshot().status.telemetry.reasoningEffort)
          .toBe('high')
        app.dispatch({ type: 'setDraft', text: 'csn' })
        await expect
          .poll(() =>
            latestPlainLines(target.output).findIndex((line) =>
              line.includes('> csn'),
            ),
          )
          .toBeGreaterThanOrEqual(0)

        const lines = latestPlainLines(target.output)
        const draftRow = lines.findIndex((line) => line.includes('> csn'))
        const caret = terminalCursorPosition(target.output)

        expect(draftRow, lines.join('\n')).toBeGreaterThanOrEqual(0)
        expect(caret.row, lines.join('\n')).toBe(draftRow)
      } finally {
        screen.unmount()
        await flush()
        screen.cleanup()
        await app.close()
      }
    },
  )

  it('does not paint hello or the tool on top of thinking', async () => {
    const runtime = createTestRuntime()
    const chat = await renderChat(runtime.value, {
      startBeforeRender: true,
      mouseSupported: true,
      columns: 80,
      rows: 24,
    })

    try {
      runtime.emit({
        method: 'session.event',
        params: {
          sessionId: 'session-1',
          event: {
            type: 'user/message',
            seq: 1,
            time: 1,
            data: {
              id: 'user-hello',
              role: 'user',
              content: [{ type: 'text', text: 'hello' }],
              source: { kind: 'user' },
            },
          },
        },
      })
      emitAssistantThinking(
        runtime,
        2,
        [
          'The user keeps saying "hello" repeatedly. Maybe they\'re testing, or maybe they expect something. Let me just respond warmly and maybe offer to do something concrete. I shouldn\'t just keep repeating the same response. Perhaps I can proactively explore the project to be more helpful. Let me offer to take a look at the codebase.',
          '',
          'Actually, rather than asking again, let me just do something useful — check the current working directory contents to give an overview. That would show initiative.',
        ].join('\n'),
      )
      emitToolError(runtime, 3, 'c1', 'browser_snapshot')
      await expect.poll(() => chat.app.snapshot().nodes.length).toBe(3)
      await renderFlush()

      const frame = latestPlainLines(chat.stdout.output).join('\n')
      expect(frame).toContain('INVALID_ARGS')
      expect(frame).not.toContain('helloe')
      expect(frame).not.toMatch(/INVALID_ARGS\)nitiative/)
      expect(frame).not.toMatch(/INVALID_ARGS.*initiative/i)
    } finally {
      await closeChat(chat)
    }
  })

  it('still selects thinking text after a tool node appears', async () => {
    const runtime = createTestRuntime()
    const chat = await renderChat(runtime.value, {
      startBeforeRender: true,
      mouseSupported: true,
      columns: 100,
    })

    try {
      emitAssistantThinking(
        runtime,
        1,
        'MARKER-THINK I should inspect the workspace before answering.',
      )
      emitToolError(runtime, 2, 'c1', 'browser_snapshot')
      await expect.poll(() => chat.app.snapshot().nodes.length).toBe(2)
      await renderFlush()

      const lines = latestPlainLines(chat.stdout.output)
      const thinkLine = lines.findIndex((line) => line.includes('MARKER-THINK'))
      expect(thinkLine, lines.join('\n')).toBeGreaterThan(0)

      const y = thinkLine + 1
      chat.stdin.write(`\u001b[<0;3;${y}M\u001b[<32;28;${y}M\u001b[<0;28;${y}m`)
      await renderFlush()

      const dispatch = vi
        .spyOn(chat.app, 'dispatch')
        .mockImplementation(() => undefined)
      chat.stdin.write('c')
      await renderFlush()

      const copied = dispatch.mock.calls.find(
        (call) => call[0]?.type === 'copyText',
      )?.[0] as { type: string; text?: string } | undefined
      expect(copied?.text ?? '', lines.join('\n')).toContain('MARKER-THINK')
      expect(copied?.text ?? '').not.toContain('browser_snapshot')
      dispatch.mockRestore()
    } finally {
      await closeChat(chat)
    }
  })

  it('keeps a drag alive across separate stdin chunks after React commits', async () => {
    const runtime = createTestRuntime()
    const chat = await renderChat(runtime.value, {
      startBeforeRender: true,
      mouseSupported: true,
      columns: 100,
    })

    try {
      emitUserMessages(runtime, 3, '')
      await expect.poll(() => chat.app.snapshot().nodes.length).toBe(3)
      await renderFlush()

      chat.stdin.write('\u001b[<0;3;4M')
      await renderFlush()
      chat.stdin.write('\u001b[<32;12;8M\u001b[<0;12;8m')
      await renderFlush()

      const dispatch = vi
        .spyOn(chat.app, 'dispatch')
        .mockImplementation(() => undefined)
      chat.stdin.write('c')
      await renderFlush()

      expect(dispatch).toHaveBeenCalledWith({
        type: 'copyText',
        text: 'message-0\n\nmessage-1\n\nmessage-2',
      })
      dispatch.mockRestore()
    } finally {
      await closeChat(chat)
    }
  })

  it('switches to the text pointer over selectable transcript', async () => {
    const runtime = createTestRuntime()
    const chat = await renderChat(runtime.value, {
      startBeforeRender: true,
      mouseSupported: true,
      columns: 100,
    })

    try {
      emitUserMessages(runtime, 3, '')
      await expect.poll(() => chat.app.snapshot().nodes.length).toBe(3)
      await renderFlush()
      chat.stdout.output = ''

      chat.stdin.write('\u001b[<35;5;4M')
      await renderFlush()
      expect(chat.stdout.output).toContain('\u001b]22;text\u0007')

      chat.stdin.write('\u001b[<35;1;1M')
      await renderFlush()
      expect(chat.stdout.output).toContain('\u001b]22;default\u0007')
    } finally {
      await closeChat(chat)
    }
  })

  it('ends transcript selection when the drag is released over the Inspector', async () => {
    const runtime = createTestRuntime()
    const chat = await renderChat(runtime.value, {
      startBeforeRender: true,
      mouseSupported: true,
      columns: 126,
    })

    try {
      emitUserMessages(runtime, 3, '')
      await expect.poll(() => chat.app.snapshot().nodes.length).toBe(3)
      await renderFlush()

      chat.stdin.write('\u001b[<0;3;4M\u001b[<32;20;4M\u001b[<0;120;9m')
      await renderFlush()
      chat.stdin.write('\u001b[<32;10;9M')
      await renderFlush()

      const dispatch = vi
        .spyOn(chat.app, 'dispatch')
        .mockImplementation(() => undefined)
      chat.stdin.write('c')
      await renderFlush()

      expect(dispatch).toHaveBeenCalledWith({
        type: 'copyText',
        text: 'message-0',
      })
      dispatch.mockRestore()
    } finally {
      await closeChat(chat)
    }
  })

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
    const chat = await renderChat(runtime.value, {
      locale: 'en',
      startBeforeRender: true,
    })

    try {
      chat.stdin.write('\u0003')
      await renderFlush()

      expect(chat.app.snapshot().quitConfirmation).toBe(true)
      expect(chat.app.snapshot().quitConfirmationSelection).toBe('confirm')
      expect(plainOutput(chat.stdout.output)).toContain(
        'Are you sure you want to quit?',
      )

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

      expect(chat.app.snapshot().composer.selection).toEqual({
        start: 0,
        end: 5,
      })
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
      await expect
        .poll(() => plainOutput(chat.stdout.output))
        .toContain('cocode is ready')
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
        {
          entryId: 'sample',
          moduleName: '@cocode/sample-plugin',
          enabled: true,
          fiberPhase: 'active',
        },
        {
          entryId: 'legacy',
          moduleName: '@deepseek-ai/dsh-legacy',
          enabled: false,
          fiberPhase: null,
        },
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
      return {
        mode: currentMode,
        supportedModes: ['manual', 'workspace-write', 'allow-all'],
      }
    }
    const chat = await renderChat(runtime.value, {
      capabilities: { ...P0_CAPABILITIES, permissionMode: true },
      startBeforeRender: true,
    })

    try {
      await flush()
      chat.app.dispatch({ type: 'command', line: '/permission' })
      await expect
        .poll(() => chat.app.snapshot().permissionPicker?.open)
        .toBe(true)
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
      const chat = await renderChat(runtime.value, {
        startBeforeRender: true,
        keymap,
        columns,
      })

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
                  source: {
                    kind: 'model',
                    provider: 'test-provider',
                    model: 'test-model',
                  },
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
        expect(plainOutput(chat.stdout.output)).toContain(
          'Ctrl+O or enter expand details',
        )

        chat.stdout.output = ''
        chat.stdin.write('\u000f')
        await renderFlush()

        expect(chat.app.snapshot().verbose).toBe(false)
        expect(plainOutput(chat.stdout.output)).toContain(
          'private reasoning detail',
        )
        expect(plainOutput(chat.stdout.output)).toContain(
          'Ctrl+O or enter collapse details',
        )

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
    const chat = await renderChat(runtime.value, {
      startBeforeRender: true,
      keymap,
    })

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
    const chat = await renderChat(runtime.value, {
      startBeforeRender: true,
      keymap,
    })

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
                source: {
                  kind: 'model',
                  provider: 'test-provider',
                  model: 'test-model',
                },
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
      await expect
        .poll(() => chat.app.snapshot().header.sessionId)
        .not.toBe('session-1')
      await renderFlush()

      expect(chat.app.snapshot().nodes).toHaveLength(0)
      expect(plainOutput(chat.stdout.output)).not.toContain(
        'session-only detail',
      )
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

function createTestRuntime(
  options: {
    cancel?: (sessionId: string) => Promise<boolean>
    onStart?: (emit: (notification: TuiNotification) => void) => void
    plugins?: TuiPluginEntry[]
  } = {},
): {
  value: TuiRuntime
  emit: (notification: TuiNotification) => void
  plugins: TuiPluginEntry[]
  requestApproval: (request: TuiApprovalRequest) => Promise<TuiApprovalAnswer>
  askQuestion: (request: TuiQuestionRequest) => Promise<TuiQuestionAnswer>
} {
  const handlers = new Set<(notification: TuiNotification) => void>()
  const plugins = options.plugins ?? []
  let approvalHandler:
    ((request: TuiApprovalRequest) => Promise<TuiApprovalAnswer>) | undefined
  let questionHandler:
    ((request: TuiQuestionRequest) => Promise<TuiQuestionAnswer>) | undefined
  const emit = (notification: TuiNotification): void => {
    for (const handler of handlers) handler(notification)
  }
  return {
    emit,
    plugins,
    requestApproval(request) {
      if (approvalHandler === undefined)
        throw new Error('approval handler unavailable')
      return approvalHandler(request)
    },
    askQuestion(request) {
      if (questionHandler === undefined)
        throw new Error('question handler unavailable')
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
        if (plugin === undefined)
          throw new Error(`plugin entry not found: ${entryId}`)
        const updated = {
          ...plugin,
          enabled,
          fiberPhase: enabled ? 'active' : null,
        } as TuiPluginEntry
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

function emitAssistantMessage(
  runtime: ReturnType<typeof createTestRuntime>,
  seq: number,
  reasoning: string,
  text: string,
): void {
  runtime.emit({
    method: 'session.event',
    params: {
      sessionId: 'session-1',
      event: {
        type: 'assistant/message',
        seq,
        time: seq,
        data: {
          turn: 1,
          step: 0,
          message: {
            id: `assistant-${seq}`,
            role: 'assistant',
            content: [
              { type: 'reasoning', text: reasoning },
              { type: 'text', text },
            ],
            source: {
              kind: 'model',
              provider: 'test-provider',
              model: 'test-model',
            },
          },
        },
      },
    },
  })
}

function emitAssistantThinking(
  runtime: ReturnType<typeof createTestRuntime>,
  seq: number,
  reasoning: string,
): void {
  runtime.emit({
    method: 'session.event',
    params: {
      sessionId: 'session-1',
      event: {
        type: 'assistant/message',
        seq,
        time: seq,
        data: {
          turn: 1,
          step: 0,
          message: {
            id: `assistant-${seq}`,
            role: 'assistant',
            content: [{ type: 'reasoning', text: reasoning }],
            source: {
              kind: 'model',
              provider: 'test-provider',
              model: 'test-model',
            },
          },
        },
      },
    },
  })
}

function emitToolError(
  runtime: ReturnType<typeof createTestRuntime>,
  seq: number,
  callId: string,
  name: string,
): void {
  runtime.emit({
    method: 'session.event',
    params: {
      sessionId: 'session-1',
      event: {
        type: 'tool/call',
        seq,
        time: seq,
        data: { turn: 1, step: 0, callId, name, arguments: '{}' },
      },
    },
  })
  runtime.emit({
    method: 'session.event',
    params: {
      sessionId: 'session-1',
      event: {
        type: 'tool/result',
        seq: seq + 1,
        time: seq + 1,
        data: {
          turn: 1,
          step: 0,
          error: { name: 'ToolArgsError', code: 'INVALID_ARGS' },
          message: {
            id: `result-${callId}`,
            role: 'user',
            content: [
              {
                type: 'tool-result',
                toolCallId: callId,
                isError: true,
                content: [{ type: 'text', text: '' }],
              },
            ],
            source: { kind: 'tool', callId },
          },
        },
      },
    },
  })
}

function terminalCursorPosition(output: string): {
  row: number
  column: number
} {
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
          const [targetRow = '1', targetColumn = '1'] = (escape[1] ?? '').split(
            ';',
          )
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

function latestPlainLines(output: string): string[] {
  const plain = output
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
    .replaceAll('\r', '')
  const lines = plain.split('\n')
  let start = 0
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index]?.includes('session session') === true) start = index
  }
  const frame = lines.slice(start)
  while (frame.at(-1) === '') frame.pop()
  return frame
}

function emitUserMessages(
  runtime: ReturnType<typeof createTestRuntime>,
  count: number,
  suffix = ` ${'x'.repeat(90)}`,
): void {
  for (let index = 0; index < count; index += 1) {
    runtime.emit({
      method: 'session.event',
      params: {
        sessionId: 'session-1',
        event: {
          type: 'user/message',
          seq: index + 1,
          time: index + 1,
          data: {
            id: `user-${index}`,
            role: 'user',
            content: [{ type: 'text', text: `message-${index}${suffix}` }],
            source: { kind: 'user' },
          },
        },
      },
    })
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
    rows?: number
    mouseSupported?: boolean
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
  const stdout = new CaptureStream(options.columns ?? 100, options.rows ?? 30)
  const screen = render(
    React.createElement(Chat, {
      app,
      keymap: options.keymap,
      mouseSupported: options.mouseSupported ?? false,
      mouseInput: stdin,
      mouseOutput: stdout,
    }),
    {
      stdin: stdin as unknown as NodeJS.ReadStream,
      stdout: stdout as unknown as NodeJS.WriteStream,
      debug: true,
      patchConsole: false,
      exitOnCtrlC: false,
      kittyKeyboard: { mode: 'enabled' },
    },
  )
  return { app, stdin, stdout, screen }
}

async function closeChat(
  chat: Awaited<ReturnType<typeof renderChat>>,
): Promise<void> {
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

function lastPaint(output: string): string {
  const marker = 'Plan preview'
  const start = output.lastIndexOf(marker)
  return start === -1 ? output : output.slice(start)
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

  _write(
    chunk: Buffer | string,
    _encoding: BufferEncoding,
    callback: () => void,
  ): void {
    this.output += chunk.toString()
    callback()
  }
}
