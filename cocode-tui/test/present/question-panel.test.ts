import { PassThrough, Writable } from 'node:stream'
import React from 'react'
import { render } from 'ink'
import { describe, expect, it, vi } from 'vitest'
import { QuestionPanel } from '../../src/present/components/QuestionPanel.tsx'

describe('QuestionPanel input', () => {
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
