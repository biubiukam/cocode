import { Writable } from 'node:stream'
import React from 'react'
import { Box, render } from 'ink'
import stringWidth from 'string-width'
import { describe, expect, it } from 'vitest'
import type { ConversationNode, ToolNode } from '../../src/runtime/nodes/types.ts'
import { MessageList } from '../../src/present/components/MessageList.tsx'
import { ToolCard } from '../../src/present/components/ToolCard.tsx'

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

  it('renders read, search, terminal, diff, and unknown tools as one compact summary line', async () => {
    const cases = [
      ['read', toolNode({ name: 'read', view: { kind: 'read', path: 'src/main.ts' } })],
      ['search', toolNode({ name: 'search', view: { kind: 'search', query: 'TODO' } })],
      [
        'terminal',
        toolNode({ name: 'terminal', view: { kind: 'terminal', command: 'git status --short' } }),
      ],
      [
        'diff',
        toolNode({
          name: 'apply_patch',
          view: {
            kind: 'diff',
            summary: {
              files: [
                {
                  path: 'src/main.ts',
                  additions: 3,
                  deletions: 1,
                  binary: false,
                  truncated: false,
                  lines: [],
                },
              ],
              additions: 3,
              deletions: 1,
              truncated: false,
              binaryFiles: 0,
            },
          },
        }),
      ],
      ['unknown', toolNode({ name: '', args: '{}', result: 'completed safely' })],
    ] satisfies readonly (readonly [string, ToolNode])[]
    const rendered = Object.fromEntries(
      await Promise.all(
        cases.map(async ([kind, node]) => {
          const lines = await renderTool(node, false, 60)
          expect(lines).toHaveLength(1)
          return [kind, lines[0]]
        }),
      ),
    )
    expect(rendered).toMatchInlineSnapshot(`
      {
        "diff": "│ ✓ apply_patch · done · src/main.ts · +3/-1",
        "read": "│ ✓ read · done · src/main.ts",
        "search": "│ ✓ search · done · TODO",
        "terminal": "│ ✓ terminal · done · git status --short",
        "unknown": "│ ✓ tool · done · completed safely",
      }
    `)
  })

  it('reveals bounded full details in expanded or verbose mode', async () => {
    const lines = await renderTool(
      toolNode({
        name: 'custom',
        args: '{"query":"needle"}',
        result: 'first line\nsecond line',
      }),
      true,
      60,
    )
    expect(lines.join('\n')).toContain('args {"query":"needle"}')
    expect(lines.join('\n')).toContain('first line')
    expect(lines.join('\n')).toContain('second line')
  })
})

async function renderTool(node: ToolNode, verbose: boolean, maxColumns: number): Promise<string[]> {
  const stdout = new CaptureStream(80, 20)
  const app = render(
    React.createElement(
      Box,
      { width: 80 },
      React.createElement(ToolCard, { node, verbose, locale: 'en', maxColumns }),
    ),
    {
      stdout: stdout as unknown as NodeJS.WriteStream,
      debug: true,
      patchConsole: false,
      exitOnCtrlC: false,
    },
  )
  await new Promise<void>((resolve) => setImmediate(resolve))
  const output = stdout.output
  app.unmount()
  await new Promise<void>((resolve) => setImmediate(resolve))
  app.cleanup()
  return output
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== '')
}

function toolNode(overrides: Partial<ToolNode> = {}): ToolNode {
  return {
    kind: 'tool',
    id: 'tool-1',
    seq: 1,
    time: 0,
    callId: 'call-1',
    name: 'tool',
    args: '{}',
    status: 'success',
    ...overrides,
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
