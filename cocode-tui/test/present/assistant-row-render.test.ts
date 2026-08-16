import { Writable } from 'node:stream'
import React from 'react'
import { Box, render } from 'ink'
import stringWidth from 'string-width'
import { describe, expect, it } from 'vitest'
import type { AssistantNode } from '../../src/runtime/nodes/types.ts'
import { AssistantRow } from '../../src/present/components/AssistantRow.tsx'

describe('AssistantRow rendering', () => {
  it('wraps expanded reasoning to the provided message width', async () => {
    const stdout = new CaptureStream(80, 20)
    const node: AssistantNode = {
      kind: 'assistant',
      id: 'assistant-1',
      seq: 1,
      time: 1,
      turn: 1,
      step: 1,
      text: 'Done.',
      reasoning:
        'The user just said hello. Previous context: we were chatting, I made a task list. The last in-progress item is a long item. Just a friendly greeting. I can respond warmly, maybe mark the last todo complete since I did show the list. Let me update the todo list to mark everything complete, then greet.',
      streaming: false,
    }
    const app = render(
      React.createElement(
        Box,
        { width: 80 },
        React.createElement(AssistantRow, {
          node,
          verbose: true,
          locale: 'en',
          maxColumns: 40,
        }),
      ),
      {
        stdout: stdout as unknown as NodeJS.WriteStream,
        debug: true,
        patchConsole: false,
        exitOnCtrlC: false,
      },
    )

    await new Promise<void>((resolve) => setImmediate(resolve))
    app.unmount()
    await new Promise<void>((resolve) => setImmediate(resolve))
    app.cleanup()

    const lines = stdout.output
      .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
      .split('\n')
      .filter((line) => line.includes('The user') || line.includes('list.'))

    expect(lines.length).toBeGreaterThan(0)
    expect(Math.max(...lines.map((line) => stringWidth(line)))).toBeLessThanOrEqual(40)
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
