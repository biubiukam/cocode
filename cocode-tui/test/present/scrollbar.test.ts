import { Writable } from 'node:stream'
import React from 'react'
import { Box, render } from 'ink'
import { describe, expect, it } from 'vitest'
import type { ConversationNode } from '../../src/runtime/nodes/types.ts'
import { MessageList } from '../../src/present/components/MessageList.tsx'
import { glyphs } from '../../src/present/glyphs.ts'
import { scrollbarThumb } from '../../src/present/scrollbar.ts'

const ANSI_PATTERN = /\u001b\[[0-?]*[ -/]*[@-~]/g
const FRAME_BOUNDARY = '\u001b[?25l'

describe('scrollbar thumb', () => {
  it('hides when the content fits in the track', () => {
    expect(scrollbarThumb({ trackRows: 10, contentRows: 8, scrollOffset: 0 })).toBeUndefined()
    expect(scrollbarThumb({ trackRows: 10, contentRows: 10, scrollOffset: 0 })).toBeUndefined()
  })

  it('pins the thumb to the bottom while following the newest rows', () => {
    expect(scrollbarThumb({ trackRows: 10, contentRows: 20, scrollOffset: 0 })).toEqual({
      start: 5,
      size: 5,
    })
  })

  it('pins the thumb to the top when scrolled to the oldest rows', () => {
    expect(scrollbarThumb({ trackRows: 10, contentRows: 20, scrollOffset: 10 })).toEqual({
      start: 0,
      size: 5,
    })
  })

  it('keeps a one-row thumb for a very long transcript', () => {
    expect(scrollbarThumb({ trackRows: 8, contentRows: 800, scrollOffset: 0 })).toEqual({
      start: 7,
      size: 1,
    })
  })
})

describe('message list scrollbar', () => {
  it('draws a right-edge thumb only when the transcript overflows', async () => {
    const overflowing = await renderMessageList({
      nodes: Array.from({ length: 8 }, (_, index) => user(String(index + 1))),
      maxRows: 6,
      maxColumns: 40,
    })
    const fitting = await renderMessageList({
      nodes: [user('1')],
      maxRows: 6,
      maxColumns: 40,
    })

    expect(overflowing.some((line) => line.endsWith(glyphs.scrollThumb))).toBe(true)
    expect(fitting.every((line) => !line.endsWith(glyphs.scrollThumb))).toBe(true)
    expect(fitting.every((line) => !line.endsWith(glyphs.scrollTrack))).toBe(true)
  })
})

function user(id: string): ConversationNode {
  return { kind: 'user', id, seq: Number(id), time: Number(id), text: `msg-${id}` }
}

async function renderMessageList(options: {
  nodes: readonly ConversationNode[]
  maxRows: number
  maxColumns: number
}): Promise<string[]> {
  const stdout = new CaptureStream(options.maxColumns, options.maxRows)
  const app = render(
    React.createElement(
      Box,
      { width: options.maxColumns, height: options.maxRows },
      React.createElement(MessageList, {
        nodes: options.nodes,
        verbose: false,
        locale: 'en',
        maxRows: options.maxRows,
        maxColumns: options.maxColumns,
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
  const frame = (stdout.output.split(FRAME_BOUNDARY).at(-1) ?? stdout.output)
    .replace(ANSI_PATTERN, '')
    .replaceAll('\r', '')
  const lines = frame.split('\n')
  while (lines.at(-1) === '') lines.pop()
  return lines
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
