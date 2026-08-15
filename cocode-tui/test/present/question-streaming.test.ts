import { Writable } from 'node:stream'
import React from 'react'
import { Box, render } from 'ink'
import { describe, expect, it } from 'vitest'
import { ToolCard } from '../../src/present/components/ToolCard.tsx'

describe('streaming question card', () => {
  it('renders the partial question before the tool call is complete', async () => {
    const stdout = new CaptureStream(80, 20)
    const app = render(
      React.createElement(
        Box,
        { width: 80 },
        React.createElement(ToolCard, {
          node: {
            kind: 'tool',
            id: 'question-1',
            seq: 1,
            time: 1,
            callId: 'question-1',
            name: 'ask_user_question',
            args: '{"questions":[{"id":"goal","question":"你的学习目标是',
            status: 'running',
            streaming: true,
          },
          verbose: false,
          locale: 'zh',
          maxColumns: 60,
        }),
      ),
      {
        stdout: stdout as unknown as NodeJS.WriteStream,
        patchConsole: false,
        exitOnCtrlC: false,
      },
    )

    await new Promise<void>((resolve) => setImmediate(resolve))
    app.unmount()
    await new Promise<void>((resolve) => setImmediate(resolve))
    app.cleanup()

    const output = stdout.output.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
    expect(output).toContain('问题生成中')
    expect(output).toContain('你的学习目标是')
  })
})

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
