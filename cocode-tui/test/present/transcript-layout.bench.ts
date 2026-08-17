/**
 * Transcript measure benchmarks. Run: pnpm bench
 */

import { Writable } from 'node:stream'
import React from 'react'
import { render } from 'ink'
import { bench, describe } from 'vitest'
import type { AssistantNode, ConversationNode, UserNode } from '../../src/runtime/nodes/types.ts'
import {
  maxMessageScrollOffset,
  resolveMessageWindow,
} from '../../src/present/message-scroll.ts'
import { MessageList } from '../../src/present/components/MessageList.tsx'

const MARKDOWN = [
  '## Summary',
  '',
  '- first item in the list',
  '- second item with more words',
  '',
  '```ts',
  'export function example(value: string): number {',
  '  return value.length',
  '}',
  '```',
  '',
  'Closing paragraph with enough text to wrap at narrow widths.',
].join('\n')

function user(id: string, text: string): UserNode {
  return { kind: 'user', id, seq: Number(id), time: Number(id), text }
}

function assistant(id: string, text: string): AssistantNode {
  return {
    kind: 'assistant',
    id,
    seq: Number(id),
    time: Number(id),
    turn: 1,
    step: 1,
    text,
    reasoning: '',
    streaming: false,
  }
}

function buildFixture(count: number): ConversationNode[] {
  const nodes: ConversationNode[] = []
  for (let index = 0; index < count; index += 1) {
    if (index % 2 === 0) nodes.push(user(String(index + 1), `user message ${index + 1}`))
    else nodes.push(assistant(String(index + 1), MARKDOWN))
  }
  return nodes
}

/** One frame's worth of transcript measuring, as MessageList and Chat do it. */
function measureFrame(
  nodes: readonly ConversationNode[],
  maxRows: number,
  maxColumns: number,
  verbose = false,
): void {
  maxMessageScrollOffset(nodes, maxRows, verbose, undefined, maxColumns)
  resolveMessageWindow(nodes, maxRows, verbose, undefined, 0, maxColumns)
}

const nodes100 = buildFixture(100)
const nodes1000 = buildFixture(1000)
const nodes2048 = buildFixture(2048)
const tallAssistant = [
  assistant('tall', Array.from({ length: 200 }, (_, row) => `line ${row}`).join('\n')),
]
const longAssistant = [
  assistant('long', Array.from({ length: 500 }, (_, row) => `line ${row}`).join('\n')),
]
const hugeAssistant = [
  assistant('huge', Array.from({ length: 2000 }, (_, row) => `line ${row}`).join('\n')),
]

describe('transcript measure', () => {
  bench('empty', () => {
    measureFrame([], 24, 80)
  })

  bench('100 cold', () => {
    measureFrame(buildFixture(100), 24, 80)
  })

  bench('100 warm', () => {
    measureFrame(nodes100, 24, 80)
  })

  bench('1000 cold', () => {
    measureFrame(buildFixture(1000), 24, 80)
  })

  bench('1000 warm', () => {
    measureFrame(nodes1000, 24, 80)
  })

  bench('2048 warm', () => {
    measureFrame(nodes2048, 24, 80)
  })

  bench('1000 streaming tail', () => {
    const nodes = nodes1000.slice()
    const last = nodes.at(-1)
    if (last?.kind === 'assistant') {
      nodes[nodes.length - 1] = { ...last, text: `${last.text}\nnext chunk`, streaming: true }
    }
    measureFrame(nodes, 24, 80)
  })

  bench('1000 scrollbar reserve 80 then 79', () => {
    measureFrame(nodes1000, 24, 80)
    measureFrame(nodes1000, 24, 79)
  })

  bench('1000 verbose flip', () => {
    measureFrame(nodes1000, 24, 80, false)
    measureFrame(nodes1000, 24, 80, true)
  })

  bench('single tall assistant', () => {
    measureFrame(tallAssistant, 24, 80)
  })
})

/** Element-tree cost, which clipping a node's body would target. */
function paintFrame(nodes: readonly ConversationNode[]): void {
  const sink = new NullStream()
  const app = render(
    React.createElement(MessageList, {
      nodes,
      verbose: false,
      maxRows: 24,
      maxColumns: 80,
      locale: 'en' as const,
    }),
    {
      stdout: sink as unknown as NodeJS.WriteStream,
      patchConsole: false,
      exitOnCtrlC: false,
    },
  )
  app.unmount()
  app.cleanup()
}

describe('transcript paint', () => {
  bench('1000 short nodes', () => {
    paintFrame(nodes1000)
  })

  bench('single tall assistant', () => {
    paintFrame(tallAssistant)
  })

  bench('single long assistant', () => {
    paintFrame(longAssistant)
  })

  bench('single huge assistant', () => {
    paintFrame(hugeAssistant)
  })
})

class NullStream extends Writable {
  readonly isTTY = false
  readonly columns = 80
  readonly rows = 24

  override _write(
    _chunk: Buffer | string,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    callback()
  }
}
