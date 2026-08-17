import { Writable } from 'node:stream'
import React from 'react'
import { Box, Text, render, renderToString } from 'ink'
import stringWidth from 'string-width'
import { describe, expect, it } from 'vitest'
import type { ConversationNode } from '../../src/runtime/nodes/types.ts'
import { MessageList } from '../../src/present/components/MessageList.tsx'
import { StatusLine } from '../../src/present/components/StatusLine.tsx'
import {
  estimateNodeRows,
  nodeAttached,
} from '../../src/present/visible-tail.ts'
import { BLOCK_GAP, MESSAGE_CHROME } from '../../src/present/layout.ts'
import {
  resolveMessageWindow,
  transcriptPaintColumns,
} from '../../src/present/message-scroll.ts'
import { formatToolSummaryLine } from '../../src/present/tool-display.ts'
import {
  selectableNodeText,
  textPointAtViewportRow,
  type MessageTextSelection,
} from '../../src/present/message-text-selection.ts'
import { wrapPlainText } from '../../src/present/text-wrap.ts'

const ANSI_PATTERN = /\u001b\[[0-?]*[ -/]*[@-~]/g
const FRAME_BOUNDARY = '\u001b[?25l'

describe('message hit layout', () => {
  it('counts the same rows Ink draws for stacked user messages', async () => {
    const nodes: ConversationNode[] = [
      { kind: 'user', id: 'one', seq: 1, time: 1, text: 'hello' },
      { kind: 'user', id: 'two', seq: 2, time: 2, text: 'world' },
    ]
    const maxColumns = 40
    const estimated = nodes.reduce(
      (total, node) => total + estimateNodeRows(node, false, false, maxColumns),
      0,
    )
    const lines = await renderLines(nodes, maxColumns)
    expect(estimateNodeRows(nodes[0]!, false, false, maxColumns)).toBe(
      BLOCK_GAP + 1,
    )
    expect(lines).toEqual(['', '│ hello', '', '│ world'])
    expect(estimated).toBe(lines.length)
  })

  it('maps a click on the second body row to that character, not the previous message', async () => {
    const nodes: ConversationNode[] = [
      { kind: 'user', id: 'one', seq: 1, time: 1, text: 'hello' },
      { kind: 'user', id: 'two', seq: 2, time: 2, text: 'world' },
    ]
    const maxColumns = 40
    const lines = await renderLines(nodes, maxColumns)
    const secondBody = lines.findIndex((line) => line.includes('world'))

    expect(
      textPointAtViewportRow({
        nodes,
        maxRows: 20,
        maxColumns,
        viewportRow: secondBody,
        cellColumn: 2,
      }),
    ).toEqual({ nodeKey: 'user:two', offset: 2 })
  })

  it('uses Ink wrap-ansi line breaks for wrapped user text', () => {
    const text = 'hello world friends'
    const columns = 10
    const lines = wrapPlainText(text, columns)

    expect(lines.map((line) => text.slice(line.start, line.end))).toEqual([
      'hello ',
      'world ',
      'friends',
    ])
    expect(
      textPointAtViewportRow({
        nodes: [{ kind: 'user', id: 'wrap', seq: 1, time: 1, text }],
        maxRows: 10,
        maxColumns: columns + MESSAGE_CHROME,
        viewportRow: BLOCK_GAP + 2,
        cellColumn: 0,
      }),
    ).toEqual({ nodeKey: 'user:wrap', offset: 12 })
  })

  it('maps a click on a rendered markdown list item to that source offset', async () => {
    const text = [
      'Here are some things I can assist with:',
      '',
      '- 🔍 Explore the codebase',
      '- 📝 Review code or changes',
    ].join('\n')
    const nodes: ConversationNode[] = [
      {
        kind: 'assistant',
        id: 'list',
        seq: 1,
        time: 1,
        turn: 1,
        step: 0,
        text,
        reasoning: '',
        streaming: false,
      },
    ]
    const maxColumns = 80
    const lines = await renderLines(nodes, maxColumns)
    const row = lines.findIndex((line) => line.includes('changes'))
    const line = lines[row] ?? ''
    const cellColumn = Math.max(
      0,
      stringWidth(line.slice(0, Math.max(0, line.indexOf('changes')))) -
        MESSAGE_CHROME,
    )

    expect(row).toBeGreaterThan(0)
    expect(
      textPointAtViewportRow({
        nodes,
        maxRows: 20,
        maxColumns,
        viewportRow: row,
        cellColumn,
      }),
    ).toEqual({ nodeKey: 'assistant:list', offset: text.indexOf('changes') })
  })

  it('maps a click after an attached tool onto that thinking line, not the one above', async () => {
    const reasoning = [
      'can be more helpful. Let me see what is in the working directory.',
      '▪ I need to actually run a command to explore the project.',
    ].join('\n')
    const nodes: ConversationNode[] = [
      {
        kind: 'assistant',
        id: 'a1',
        seq: 1,
        time: 1,
        turn: 1,
        step: 0,
        text: 'done',
        reasoning: '',
        streaming: false,
      },
      {
        kind: 'tool',
        id: 't1',
        seq: 2,
        time: 2,
        callId: 'c1',
        name: 'browser_snapshot',
        args: '',
        status: 'error',
        error: { name: 'ToolArgsError', code: 'INVALID_ARGS' },
      },
      {
        kind: 'assistant',
        id: 'a2',
        seq: 3,
        time: 3,
        turn: 1,
        step: 1,
        text: '',
        reasoning,
        streaming: false,
      },
    ]
    const maxColumns = 80
    const lines = await renderLines(nodes, maxColumns)
    const row = lines.findIndex((line) => line.includes('I need to actually'))

    expect(row).toBeGreaterThan(0)
    expect(lines[row - 1]).toContain('can be more helpful')
    expect(estimateNodeRows(nodes[1]!, false, false, maxColumns, true)).toBe(1)
    expect(
      textPointAtViewportRow({
        nodes,
        maxRows: 30,
        maxColumns,
        viewportRow: row,
        cellColumn: 0,
      }),
    ).toEqual({
      nodeKey: 'assistant:a2',
      offset: reasoning.indexOf('▪'),
    })
  })

  it('maps the tool line and the thinking after it when the transcript overflows', async () => {
    const afterTool =
      'I need to actually run a command to explore the project.'
    const nodes: ConversationNode[] = [
      ...Array.from({ length: 6 }, (_, index) => ({
        kind: 'user' as const,
        id: `pad-${index}`,
        seq: index + 1,
        time: index + 1,
        text: `hello-${index}`,
      })),
      {
        kind: 'assistant',
        id: 'a1',
        seq: 10,
        time: 10,
        turn: 1,
        step: 0,
        text: '',
        reasoning: 'check the current working directory',
        streaming: false,
      },
      {
        kind: 'tool',
        id: 't1',
        seq: 11,
        time: 11,
        callId: 'c1',
        name: 'browser_snapshot',
        args: '',
        status: 'error',
        error: { name: 'ToolArgsError', code: 'INVALID_ARGS' },
      },
      {
        kind: 'assistant',
        id: 'a2',
        seq: 12,
        time: 12,
        turn: 1,
        step: 1,
        text: '',
        reasoning: afterTool,
        streaming: false,
      },
    ]
    const maxColumns = 80
    const maxRows = 10
    const paintColumns = transcriptPaintColumns(
      nodes,
      maxRows,
      false,
      undefined,
      maxColumns,
    )
    const lines = await renderLines(nodes, maxColumns, maxRows)
    const toolRow = lines.findIndex((line) =>
      line.includes('browser_snapshot'),
    )
    const thinkingRow = lines.findIndex((line) =>
      line.includes('I need to actually'),
    )

    expect(paintColumns).toBe(maxColumns - 1)
    expect(toolRow).toBeGreaterThan(0)
    expect(thinkingRow).toBeGreaterThan(toolRow)
    expect(
      textPointAtViewportRow({
        nodes,
        maxRows,
        maxColumns: paintColumns,
        viewportRow: toolRow,
        cellColumn: 0,
      })?.nodeKey,
    ).toBe('tool:t1')
    expect(
      textPointAtViewportRow({
        nodes,
        maxRows,
        maxColumns: paintColumns,
        viewportRow: thinkingRow,
        cellColumn: 0,
      }),
    ).toEqual({
      nodeKey: 'assistant:a2',
      offset: 0,
    })
    const toolLine = lines[toolRow] ?? ''
    const detail = 'INVALID_ARGS'
    const cellColumn = Math.max(
      0,
      stringWidth(toolLine.slice(0, Math.max(0, toolLine.indexOf(detail)))) -
        MESSAGE_CHROME,
    )
    const summary = formatToolSummaryLine(
      nodes[7] as Extract<ConversationNode, { kind: 'tool' }>,
      'en',
      paintColumns ?? maxColumns,
    )
    expect(
      textPointAtViewportRow({
        nodes,
        maxRows,
        maxColumns: paintColumns,
        viewportRow: toolRow,
        cellColumn,
      }),
    ).toEqual({
      nodeKey: 'tool:t1',
      offset: summary.indexOf(detail),
    })
  })

  it('paints the same number of thinking rows that hit-testing estimates', async () => {
    const reasoning = [
      'The user keeps saying hello repeatedly so I should just respond warmly and maybe offer to do something concrete instead of asking again.',
      'Actually, rather than asking again, let me just do something useful — check the current working directory.',
    ].join('\n')
    const node: ConversationNode = {
      kind: 'assistant',
      id: 'a1',
      seq: 1,
      time: 1,
      turn: 1,
      step: 0,
      text: '',
      reasoning,
      streaming: false,
    }
    const maxColumns = 80
    const columns = maxColumns - MESSAGE_CHROME
    const lines = await renderLines([node], maxColumns)
    const painted = [
      ...new Set(
        lines.filter(
          (line) =>
            line.includes('The user') ||
            line.includes('maybe offer') ||
            line.includes('Actually') ||
            line.includes('directory'),
        ),
      ),
    ]
    expect(estimateNodeRows(node, false, false, maxColumns)).toBe(
      BLOCK_GAP + wrapPlainText(reasoning, columns).length,
    )
    expect(painted.length).toBe(wrapPlainText(reasoning, columns).length)
  })

  it('keeps the tool row aligned after long wrapped thinking', async () => {
    const reasoning = [
      'The user keeps saying hello repeatedly so I should just respond warmly and maybe offer to do something concrete instead of asking again.',
      'Actually, rather than asking again, let me just do something useful — check the current working directory.',
    ].join('\n')
    const nodes: ConversationNode[] = [
      ...Array.from({ length: 8 }, (_, index) => ({
        kind: 'user' as const,
        id: `pad-${index}`,
        seq: index + 1,
        time: index + 1,
        text: `hello-${index} with enough text to keep earlier rows in the scrollback`,
      })),
      {
        kind: 'assistant',
        id: 'a1',
        seq: 20,
        time: 20,
        turn: 1,
        step: 0,
        text: '',
        reasoning,
        streaming: false,
      },
      {
        kind: 'tool',
        id: 't1',
        seq: 21,
        time: 21,
        callId: 'c1',
        name: 'browser_snapshot',
        args: '',
        status: 'error',
        error: { name: 'ToolArgsError', code: 'INVALID_ARGS' },
      },
    ]
    const maxColumns = 80
    const maxRows = 12
    const paintColumns = transcriptPaintColumns(
      nodes,
      maxRows,
      false,
      undefined,
      maxColumns,
    )
    const lines = await renderLines(nodes, maxColumns, maxRows)
    const toolRow = lines.findIndex((line) =>
      line.includes('browser_snapshot'),
    )

    expect(toolRow).toBeGreaterThan(0)
    expect(estimatedViewportRow(nodes, maxRows, paintColumns, 't1')).toBe(
      toolRow,
    )
    expect(
      textPointAtViewportRow({
        nodes,
        maxRows,
        maxColumns: paintColumns,
        viewportRow: toolRow,
        cellColumn: 0,
      })?.nodeKey,
    ).toBe('tool:t1')
  })

  it('paints the same rows it estimates once a tool is attached', async () => {
    const nodes: ConversationNode[] = [
      {
        kind: 'assistant',
        id: 'a1',
        seq: 1,
        time: 1,
        turn: 1,
        step: 0,
        text: '',
        reasoning: 'MARKER-THINK warm reply then call a tool.',
        streaming: false,
      },
      {
        kind: 'tool',
        id: 't1',
        seq: 2,
        time: 2,
        callId: 'c1',
        name: 'browser_snapshot',
        args: '',
        status: 'error',
        error: { name: 'ToolArgsError', code: 'INVALID_ARGS' },
      },
      {
        kind: 'assistant',
        id: 'a2',
        seq: 3,
        time: 3,
        turn: 1,
        step: 1,
        text: '',
        reasoning: 'MARKER-AFTER the tool returned an error.',
        streaming: false,
      },
    ]
    const maxColumns = 80
    const lines = renderTranscript(nodes, maxColumns)
    const estimated = nodes.reduce(
      (total, node, index) =>
        total +
        estimateNodeRows(
          node,
          false,
          false,
          maxColumns,
          nodeAttached(nodes, index),
        ),
      0,
    )
    const thinkRow = lines.findIndex((line) => line.includes('MARKER-THINK'))
    const toolRow = lines.findIndex((line) =>
      line.includes('browser_snapshot'),
    )
    const afterRow = lines.findIndex((line) => line.includes('MARKER-AFTER'))

    expect({ lines, estimated, thinkRow, toolRow, afterRow }).toEqual({
      lines,
      estimated: lines.length,
      thinkRow: estimatedViewportRow(nodes, 30, maxColumns, 'a1') + BLOCK_GAP,
      toolRow: estimatedViewportRow(nodes, 30, maxColumns, 't1'),
      afterRow: estimatedViewportRow(nodes, 30, maxColumns, 'a2') + BLOCK_GAP,
    })
    expect(
      textPointAtViewportRow({
        nodes,
        maxRows: 30,
        maxColumns,
        viewportRow: afterRow,
        cellColumn: 0,
      })?.nodeKey,
    ).toBe('assistant:a2')
  })

  it('does not paint the tool on top of the last thinking line', async () => {
    const reasoning = [
      "The user keeps saying \"hello\" repeatedly. Maybe they're testing, or maybe they expect something. Let me just respond warmly and maybe offer to do something concrete. I shouldn't just keep repeating the same response. Perhaps I can proactively explore the project to be more helpful. Let me offer to take a look at the codebase.",
      '',
      'Actually, rather than asking again, let me just do something useful — check the current working directory contents to give an overview. That would show initiative.',
    ].join('\n')
    const nodes: ConversationNode[] = [
      { kind: 'user', id: 'u1', seq: 1, time: 1, text: 'hello' },
      {
        kind: 'assistant',
        id: 'a1',
        seq: 2,
        time: 2,
        turn: 1,
        step: 0,
        text: '',
        reasoning,
        streaming: false,
      },
      {
        kind: 'tool',
        id: 't1',
        seq: 3,
        time: 3,
        callId: 'c1',
        name: 'browser_snapshot',
        args: '',
        status: 'error',
        error: { name: 'ToolArgsError', code: 'INVALID_ARGS' },
      },
      {
        kind: 'assistant',
        id: 'a2',
        seq: 4,
        time: 4,
        turn: 1,
        step: 1,
        text: '',
        reasoning:
          "I need to actually run a command to explore the project. But I don't have a shell tool available.",
        streaming: false,
      },
    ]
    const lines = await renderLines(nodes, 100, 12)
    const toolLine = lines.find((line) => line.includes('INVALID_ARGS'))

    expect(toolLine, lines.join('\n')).toBeDefined()
    expect(toolLine).not.toMatch(/initiative|useful|directory/i)
    expect(lines.join('\n')).not.toContain('helloe')
  })

  it('does not overlap the tool when the transcript column is squeezed', () => {
    const reasoning = [
      "The user keeps saying \"hello\" repeatedly. Maybe they're testing, or maybe they expect something. Let me just respond warmly and maybe offer to do something concrete. I shouldn't just keep repeating the same response. Perhaps I can proactively explore the project to be more helpful. Let me offer to take a look at the codebase.",
      '',
      'Actually, rather than asking again, let me just do something useful — check the current working directory contents to give an overview. That would show initiative.',
    ].join('\n')
    const nodes: ConversationNode[] = [
      { kind: 'user', id: 'u1', seq: 1, time: 1, text: 'hello' },
      {
        kind: 'assistant',
        id: 'a1',
        seq: 2,
        time: 2,
        turn: 1,
        step: 0,
        text: '',
        reasoning,
        streaming: false,
      },
      {
        kind: 'tool',
        id: 't1',
        seq: 3,
        time: 3,
        callId: 'c1',
        name: 'browser_snapshot',
        args: '',
        status: 'error',
        error: { name: 'ToolArgsError', code: 'INVALID_ARGS' },
      },
    ]
    const frame = renderToString(
      React.createElement(
        Box,
        { flexDirection: 'column', width: 100, height: 16 },
        React.createElement(
          Box,
          { height: 4 },
          React.createElement(Text, null, 'chrome'),
        ),
        React.createElement(MessageList, {
          nodes,
          verbose: false,
          locale: 'en',
          maxColumns: 100,
          maxRows: 14,
        }),
      ),
      { columns: 100 },
    )
    const lines = frame
      .replace(ANSI_PATTERN, '')
      .replaceAll('\r', '')
      .split('\n')
    const toolLine = lines.find((line) => line.includes('INVALID_ARGS'))
    expect(toolLine, lines.join('\n')).toBeDefined()
    expect(toolLine).not.toMatch(/initiative|useful|directory/i)
    expect(lines.join('\n')).not.toContain('helloe')
  })

  it('does not paint the copy notice on the last thinking line', async () => {
    const reasoning = [
      "Wait, the tools available are only browser_act, browser_close, browser_open, browser_snapshot, browser_tabs. There's no shell/exec tool. So I can't explore the codebase directly.",
      '',
      'Hmm, maybe the harness will provide tools when needed. But right now I only have browser tools.',
    ].join('\n')
    const nodes: ConversationNode[] = [
      { kind: 'user', id: 'u1', seq: 1, time: 1, text: 'hello' },
      {
        kind: 'assistant',
        id: 'a1',
        seq: 2,
        time: 2,
        turn: 1,
        step: 0,
        text: '',
        reasoning,
        streaming: false,
      },
    ]
    const stdout = new CaptureStream(80, 16)
    const app = render(
      React.createElement(
        Box,
        { flexDirection: 'column', width: 80, height: 16 },
        React.createElement(MessageList, {
          nodes,
          verbose: false,
          locale: 'en',
          maxColumns: 80,
          maxRows: 12,
        }),
        React.createElement(StatusLine, {
          status: {
            line: 'ready',
            telemetry: {},
            todos: [],
            queueCount: 0,
            focusMode: false,
            permissionMode: 'default',
            planMode: false,
          },
          agent: 'idle',
          notice: { tone: 'info', message: 'Copied to clipboard.' },
          locale: 'en',
          noticeRows: 1,
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
    const lines = latestFrame(stdout.output).split('\n')
    const noticeLine = lines.find((line) =>
      line.includes('Copied to clipboard.'),
    )
    const readyLine = lines.find((line) => line.includes('ready'))

    expect(noticeLine, lines.join('\n')).toBeDefined()
    expect(noticeLine).not.toMatch(/harness|will provide|browser tools/i)
    expect(readyLine, lines.join('\n')).toBeDefined()
    expect(readyLine).not.toMatch(/harness|will provide|browser tools/i)
    expect(lines.join('\n')).not.toContain('readyss')
  })

  it('does not overlap list items when the assistant body is selected', async () => {
    const reasoning = [
      "I should be honest with the user about what I can do, or simply respond. The user keeps saying hello. Let me just respond cheerfully and ask what they'd like to do, being honest that my main capability here is working through this GUI. Actually, I am a coding agent — but without a shell tool, I can't run commands. Hmm, maybe the harness will provide tools when needed. But right now I only have browser tools.",
      '',
      'Let me just be warm and clear.',
    ].join('\n')
    const text = [
      'Hi there! 😊',
      "I'm here and ready to help. Since you've said hello a few times, I want to make sure I'm being useful — what would you like to do with your cocode-tui project? For example:",
      '',
      '- Explain part of the codebase',
      '- Fix or implement something',
      '- Run tests or builds',
      '- Review recent changes',
      "Just let me know and I'll get started!",
    ].join('\n')
    const nodes: ConversationNode[] = [
      {
        kind: 'assistant',
        id: 'a1',
        seq: 1,
        time: 1,
        turn: 1,
        step: 0,
        text,
        reasoning,
        streaming: false,
      },
    ]
    const selected = selectableNodeText(nodes[0]!, { maxColumns: 80 })
    const lines = await renderLines(nodes, 80, 14, {
      selectedNodeId: 'assistant:a1',
      textSelection: {
        anchor: { nodeKey: 'assistant:a1', offset: 0 },
        focus: { nodeKey: 'assistant:a1', offset: selected.length },
      },
    })
    const frame = lines.join('\n')
    expect(frame).toContain('Run tests or builds')
    expect(frame).not.toMatch(/buildsmething/i)
    expect(frame).not.toMatch(/ odebase| arness /)
    expect(frame).toContain('Explain part of the codebase')
    expect(frame).toContain('Fix or implement something')
  })

  it('counts running question tools as the extra rows ToolCard paints', () => {
    const node: ConversationNode = {
      kind: 'tool',
      id: 'q1',
      seq: 1,
      time: 1,
      callId: 'q1',
      name: 'ask_user_question',
      args: '{"question":"Which file should I open?"}',
      status: 'running',
    }
    expect(estimateNodeRows(node, false, false, 80, true)).toBe(3)
  })

  it('keeps three attached tools on consecutive painted rows', () => {
    const nodes: ConversationNode[] = [
      {
        kind: 'assistant',
        id: 'a1',
        seq: 1,
        time: 1,
        turn: 1,
        step: 0,
        text: '',
        reasoning: 'MARKER-THINK call three tools',
        streaming: false,
      },
      ...['read', 'bash', 'browser_snapshot'].map((name, index) => ({
        kind: 'tool' as const,
        id: `t${index}`,
        seq: index + 2,
        time: index + 2,
        callId: `c${index}`,
        name,
        args: '',
        status: 'success' as const,
        result: 'ok',
      })),
    ]
    const lines = renderTranscript(nodes, 80)
    const thinkRow = lines.findIndex((line) => line.includes('MARKER-THINK'))
    const toolRows = ['read', 'bash', 'browser_snapshot'].map((name) =>
      lines.findIndex((line) => line.includes(name)),
    )
    expect(toolRows).toEqual([thinkRow + 1, thinkRow + 2, thinkRow + 3])
    expect(
      toolRows.map(
        (row) =>
          textPointAtViewportRow({
            nodes,
            maxRows: 20,
            maxColumns: 80,
            viewportRow: row,
            cellColumn: 0,
          })?.nodeKey,
      ),
    ).toEqual(['tool:t0', 'tool:t1', 'tool:t2'])
  })
})

function estimatedViewportRow(
  nodes: readonly ConversationNode[],
  maxRows: number,
  maxColumns: number | undefined,
  nodeId: string,
): number {
  const window = resolveMessageWindow(
    nodes,
    maxRows,
    false,
    undefined,
    0,
    maxColumns,
  )
  let row = -window.hiddenRowsBefore
  const startIndex =
    window.nodes[0] === undefined ? 0 : nodes.indexOf(window.nodes[0])
  for (let offset = 0; offset < window.nodes.length; offset += 1) {
    const node = window.nodes[offset]
    if (node === undefined) continue
    if (node.id === nodeId) return row
    row += estimateNodeRows(
      node,
      false,
      false,
      maxColumns,
      nodeAttached(nodes, startIndex + offset),
    )
  }
  return -1
}

function renderTranscript(
  nodes: readonly ConversationNode[],
  maxColumns: number,
  maxRows?: number,
): string[] {
  const frame = renderToString(
    React.createElement(
      Box,
      { width: maxColumns, height: maxRows },
      React.createElement(MessageList, {
        nodes,
        verbose: false,
        locale: 'en',
        maxColumns,
        maxRows,
      }),
    ),
    { columns: maxColumns },
  )
  const lines = frame
    .replace(ANSI_PATTERN, '')
    .replaceAll('\r', '')
    .split('\n')
  while (lines.at(-1) === '') lines.pop()
  return lines
}

async function renderLines(
  nodes: readonly ConversationNode[],
  maxColumns: number,
  maxRows?: number,
  options?: {
    selectedNodeId?: string
    textSelection?: MessageTextSelection
  },
): Promise<string[]> {
  const stdout = new CaptureStream(maxColumns, maxRows ?? 30)
  const app = render(
    React.createElement(
      Box,
      { width: maxColumns, height: maxRows },
      React.createElement(MessageList, {
        nodes,
        verbose: false,
        locale: 'en',
        maxColumns,
        maxRows,
        selectedNodeId: options?.selectedNodeId,
        textSelection: options?.textSelection,
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
  const frame = latestFrame(stdout.output)
  const lines = frame.split('\n')
  while (lines.at(-1) === '') lines.pop()
  return lines
}

function latestFrame(output: string): string {
  const frames = output.split(FRAME_BOUNDARY)
  const plain = (frames.at(-1) ?? output)
    .replace(ANSI_PATTERN, '')
    .replaceAll('\r', '')
  const lines = plain.split('\n')
  for (let index = lines.length - 1; index >= 2; index -= 1) {
    if (
      lines[index]?.includes('│ world') === true &&
      lines[index - 2]?.includes('│ hello') === true &&
      lines[index - 1] === '' &&
      lines[index - 3] === ''
    ) {
      return lines.slice(index - 3, index + 1).join('\n')
    }
  }
  while (lines.at(-1) === '') lines.pop()
  return lines.join('\n')
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
