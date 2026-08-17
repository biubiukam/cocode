import { PassThrough, Writable } from 'node:stream'
import React from 'react'
import { render } from 'ink'
import { describe, expect, it, vi } from 'vitest'
import { PlanReviewPanel } from '../../src/present/components/PlanReviewPanel.tsx'
import type { TuiQuestionSnapshot } from '../../src/runtime/app.ts'

const state: TuiQuestionSnapshot = {
  key: 'plan-review',
  sessionId: 'session-1',
  position: 1,
  total: 1,
  answered: 0,
  question: {
    id: 'review',
    header: 'Plan review',
    question: 'Approve this plan and leave plan mode?',
    detail: '# Plan\n\n- inspect files',
    options: [{ label: 'Approve' }, { label: 'Keep planning' }],
    intent: { kind: 'plan-review', approve: 'Approve' },
  },
}

function longPlanState(): TuiQuestionSnapshot {
  return {
    ...state,
    question: {
      ...state.question,
      detail: `# Plan\n\n${Array.from(
        { length: 40 },
        (_, index) => `- LINE-${String(index + 1).padStart(3, '0')}`,
      ).join('\n')}`,
    },
  }
}

function plain(output: string): string {
  return output.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
}

describe('PlanReviewPanel leftover pointer', () => {
  it('ignores a leftover mouse press from before the overlay opened', async () => {
    const dispatch = vi.fn()
    const leftover = { id: 7, row: 8, action: 'press' as const }
    const app = render(
      React.createElement(PlanReviewPanel, {
        state,
        locale: 'en',
        panelStartRow: 1,
        maxRows: 16,
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

    await flush()
    expect(dispatch).not.toHaveBeenCalled()

    app.rerender(
      React.createElement(PlanReviewPanel, {
        state,
        locale: 'en',
        panelStartRow: 1,
        maxRows: 16,
        mousePointer: { id: 8, row: 8, action: 'press' },
        dispatch,
      }),
    )
    await flush()
    expect(dispatch).toHaveBeenCalledWith({
      type: 'question.answer',
      selected: ['Approve'],
    })

    app.unmount()
    await flush()
    app.cleanup()
  })
})

describe('PlanReviewPanel preview scrolling', () => {
  it('pages the preview window with PageDown', async () => {
    const stdin = new InputStream()
    const stdout = new CaptureStream(80, 24)
    const app = render(
      React.createElement(PlanReviewPanel, {
        state: longPlanState(),
        locale: 'en',
        panelStartRow: 1,
        maxRows: 16,
        dispatch: vi.fn(),
      }),
      {
        stdin: stdin as unknown as NodeJS.ReadStream,
        stdout: stdout as unknown as NodeJS.WriteStream,
        debug: true,
        patchConsole: false,
        exitOnCtrlC: false,
      },
    )

    await flush()
    expect(plain(stdout.output)).toContain('LINE-001')
    expect(plain(stdout.output)).not.toContain('LINE-007')

    stdout.output = ''
    stdin.write('\u001b[6~')
    await flush()

    expect(plain(stdout.output)).toContain('LINE-007')
    expect(plain(stdout.output)).not.toContain('LINE-001')

    app.unmount()
    await flush()
    app.cleanup()
  })

  it('scrolls the preview window from a wheel pointer', async () => {
    const stdout = new CaptureStream(80, 24)
    const app = render(
      React.createElement(PlanReviewPanel, {
        state: longPlanState(),
        locale: 'en',
        panelStartRow: 1,
        maxRows: 16,
        dispatch: vi.fn(),
      }),
      {
        stdin: new InputStream() as unknown as NodeJS.ReadStream,
        stdout: stdout as unknown as NodeJS.WriteStream,
        debug: true,
        patchConsole: false,
        exitOnCtrlC: false,
      },
    )

    await flush()
    expect(plain(stdout.output)).toContain('LINE-001')
    expect(plain(stdout.output)).not.toContain('LINE-004')

    stdout.output = ''
    app.rerender(
      React.createElement(PlanReviewPanel, {
        state: longPlanState(),
        locale: 'en',
        panelStartRow: 1,
        maxRows: 16,
        mousePointer: {
          id: 3,
          row: 6,
          action: 'move',
          wheelDelta: -1,
        },
        dispatch: vi.fn(),
      }),
    )
    await flush()

    expect(plain(stdout.output)).toContain('LINE-004')
    expect(plain(stdout.output)).toMatch(/↓ 36 more/)

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
