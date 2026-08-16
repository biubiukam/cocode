import { PassThrough, Writable } from 'node:stream'
import React from 'react'
import { render } from 'ink'
import { describe, expect, it, vi } from 'vitest'
import { QuestionPanel } from '../../src/present/components/QuestionPanel.tsx'

describe('QuestionPanel input', () => {
  it('renders question tabs with real labels and a clear prompt', async () => {
    const stdin = new InputStream()
    const stdout = new CaptureStream(80, 20)
    const app = render(
      React.createElement(QuestionPanel, {
        state: {
          key: 'question-1',
          sessionId: 'session-1',
          position: 2,
          total: 3,
          answered: 1,
          tabs: [
            { position: 1, label: 'Workspace', answered: true },
            { position: 2, label: 'Choose a model', answered: false },
            { position: 3, label: 'Output format', answered: false },
          ],
          question: {
            id: 'model',
            question: 'Choose a model',
            options: [{ label: 'Fast' }],
          },
        },
        locale: 'en',
        panelStartRow: 1,
        dispatch: vi.fn(),
      }),
      {
        stdin: stdin as unknown as NodeJS.ReadStream,
        stdout: stdout as unknown as NodeJS.WriteStream,
        patchConsole: false,
        exitOnCtrlC: false,
      },
    )

    await flush()
    const output = stdout.output.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
    expect(output).toContain('1. Workspace')
    expect(output).toContain('2. Choose a model')
    expect(output).toContain('3. Output format')
    expect(output).toContain('Choose a model')
    expect(output).not.toContain('?1')
    expect(output).not.toContain(' ? ')
    expect(output).not.toContain('previous')
    expect(output).not.toContain('next')

    app.unmount()
    await flush()
    app.cleanup()
  })

  it('uses a readable fallback when the question text is only a placeholder', async () => {
    const stdin = new InputStream()
    const stdout = new CaptureStream(80, 20)
    const app = render(
      React.createElement(QuestionPanel, {
        state: {
          key: 'question-1',
          sessionId: 'session-1',
          position: 1,
          total: 1,
          answered: 0,
          question: { id: 'missing', question: '?', detail: 'Select a value' },
        },
        locale: 'en',
        panelStartRow: 1,
        dispatch: vi.fn(),
      }),
      {
        stdin: stdin as unknown as NodeJS.ReadStream,
        stdout: stdout as unknown as NodeJS.WriteStream,
        patchConsole: false,
        exitOnCtrlC: false,
      },
    )

    await flush()
    const output = stdout.output.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
    expect(output).toContain('Select a value')
    expect(output).not.toContain('Question text unavailable')

    app.unmount()
    await flush()
    app.cleanup()
  })

  it('submits the focused single option on Enter', async () => {
    const stdin = new InputStream()
    const stdout = new CaptureStream(80, 20)
    const dispatch = vi.fn()
    const app = render(
      React.createElement(QuestionPanel, {
        state: {
          key: 'question-1',
          sessionId: 'session-1',
          position: 1,
          total: 1,
          answered: 0,
          question: {
            id: 'choice',
            question: 'Choose one',
            options: [{ label: 'Preset' }],
          },
        },
        locale: 'en',
        panelStartRow: 1,
        dispatch,
      }),
      {
        stdin: stdin as unknown as NodeJS.ReadStream,
        stdout: stdout as unknown as NodeJS.WriteStream,
        patchConsole: false,
        exitOnCtrlC: false,
      },
    )

    await flush()
    stdin.write('\r')
    await flush()

    expect(dispatch).toHaveBeenCalledWith({ type: 'question.answer', selected: ['Preset'] })
    app.unmount()
    await flush()
    app.cleanup()
  })

  it('dispatches navigation with the saved selection', async () => {
    const stdin = new InputStream()
    const stdout = new CaptureStream(80, 20)
    const dispatch = vi.fn()
    const app = render(
      React.createElement(QuestionPanel, {
        state: {
          key: 'question-1',
          sessionId: 'session-1',
          position: 1,
          total: 2,
          answered: 1,
          answer: { id: 'choice', selected: ['Preset'] },
          question: {
            id: 'choice',
            question: 'Type an answer',
            options: [{ label: 'Preset' }],
          },
        },
        locale: 'en',
        panelStartRow: 1,
        dispatch,
      }),
      {
        stdin: stdin as unknown as NodeJS.ReadStream,
        stdout: stdout as unknown as NodeJS.WriteStream,
        patchConsole: false,
        exitOnCtrlC: false,
      },
    )

    stdin.write('\u001B[C')
    await flush()

    expect(dispatch).toHaveBeenCalledWith({
      type: 'question.navigate',
      direction: 'next',
      selected: ['Preset'],
      dirty: false,
    })

    app.unmount()
    await flush()
    app.cleanup()
  })

  it('deletes the previous custom-answer character with Delete', async () => {
    const stdin = new InputStream()
    const stdout = new CaptureStream(80, 20)
    const dispatch = vi.fn()
    const app = render(
      React.createElement(QuestionPanel, {
        state: {
          key: 'question-1',
          sessionId: 'session-1',
          position: 1,
          total: 1,
          answered: 0,
          question: {
            id: 'choice',
            question: 'Type an answer',
          },
        },
        locale: 'en',
        panelStartRow: 1,
        dispatch,
      }),
      {
        stdin: stdin as unknown as NodeJS.ReadStream,
        stdout: stdout as unknown as NodeJS.WriteStream,
        patchConsole: false,
        exitOnCtrlC: false,
      },
    )

    await flush()
    stdin.write('ab')
    await flush()
    stdin.write('\u001B[3~')
    await flush()
    stdin.write('\r')
    await flush()

    expect(dispatch).toHaveBeenCalledWith({
      type: 'question.answer',
      selected: [],
      custom: 'a',
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

  constructor(
    readonly columns: number,
    readonly rows: number,
  ) {
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
