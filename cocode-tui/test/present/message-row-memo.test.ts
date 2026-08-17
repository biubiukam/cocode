import { Writable } from 'node:stream'
import React from 'react'
import { Box, render } from 'ink'
import { describe, expect, it } from 'vitest'
import type { AssistantNode } from '../../src/runtime/nodes/types.ts'
import { AssistantRow } from '../../src/present/components/AssistantRow.tsx'
import { ToolCard } from '../../src/present/components/ToolCard.tsx'
import { UserRow } from '../../src/present/components/UserRow.tsx'

const MEMO = Symbol.for('react.memo')

function streamingAssistant(text: string): AssistantNode {
  return {
    kind: 'assistant',
    id: '1:0',
    seq: 1,
    time: 1,
    turn: 1,
    step: 0,
    text,
    reasoning: '',
    streaming: true,
    thinking: false,
  }
}

describe('message row memoisation', () => {
  it('memoises the rows that dominate a long transcript', () => {
    for (const row of [UserRow, AssistantRow, ToolCard]) {
      expect((row as unknown as { $$typeof: symbol }).$$typeof).toBe(MEMO)
    }
  })

  it('still repaints a streaming reply republished as a new node', async () => {
    const stdout = new CaptureStream(80, 8)
    const app = render(
      React.createElement(
        Box,
        { width: 80 },
        React.createElement(AssistantRow, {
          node: streamingAssistant('Hel'),
          verbose: false,
          locale: 'en',
          maxColumns: 80,
        }),
      ),
      {
        stdout: stdout as unknown as NodeJS.WriteStream,
        patchConsole: false,
        exitOnCtrlC: false,
        // CI/GITHUB_ACTIONS makes Ink defer frames until unmount.
        interactive: true,
      },
    )

    expect(visible(stdout.output)).toContain('Hel')

    stdout.output = ''
    app.rerender(
      React.createElement(
        Box,
        { width: 80 },
        React.createElement(AssistantRow, {
          node: streamingAssistant('Hello there'),
          verbose: false,
          locale: 'en',
          maxColumns: 80,
        }),
      ),
    )

    await flushFrames()

    expect(visible(stdout.output)).toContain('Hello there')

    app.unmount()
    app.cleanup()
  })

  it('accepts a settled node that keeps its identity as equal props', () => {
    const node: AssistantNode = { ...streamingAssistant('settled reply'), streaming: false }
    const before = { node, verbose: false, locale: 'en' as const, maxColumns: 80 }
    const after = { node, verbose: false, locale: 'en' as const, maxColumns: 80 }

    expect(shallowEqual(before, after)).toBe(true)
    expect(
      shallowEqual(before, { ...after, node: { ...node, text: 'edited reply' } }),
    ).toBe(false)
  })
})

/** React.memo's default comparison, asserted against the props rows receive. */
function shallowEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keys = Object.keys(a)
  if (keys.length !== Object.keys(b).length) return false
  return keys.every((key) => Object.is(a[key], b[key]))
}

/** Ink throttles frames, so a repaint lands after the leading edge. */
async function flushFrames(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 100))
}

function visible(output: string): string {
  return output.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
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
