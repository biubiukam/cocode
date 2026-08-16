import { Writable } from 'node:stream'
import React from 'react'
import { Box, render } from 'ink'
import stringWidth from 'string-width'
import { describe, expect, it } from 'vitest'
import type { ConversationNode } from '../../src/runtime/nodes/types.ts'
import { MessageList } from '../../src/present/components/MessageList.tsx'

describe('ToolCard rendering', () => {
  it('wraps a tool result to the provided message width', async () => {
    const stdout = new CaptureStream(80, 20)
    const nodes: readonly ConversationNode[] = [
      {
        kind: 'tool',
        id: 'tool-1',
        seq: 1,
        time: 1,
        callId: 'call-1',
        name: 'todo_write',
        args: '{}',
        status: 'success',
        result: 'Updated todo list: 0 pending, 0 in progress, 3 completed.',
      },
    ]
    const app = render(
      React.createElement(
        Box,
        { width: 80 },
        React.createElement(MessageList, {
          nodes,
          verbose: false,
          maxRows: 10,
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
      .filter((line) => line.includes('todo_write') || line.includes('Updated'))

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
