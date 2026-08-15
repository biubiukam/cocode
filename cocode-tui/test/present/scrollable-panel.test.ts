import { Writable } from 'node:stream'
import React from 'react'
import { Box, render, Text } from 'ink'
import { describe, expect, it } from 'vitest'
import {
  ScrollablePanel,
  scrollMetrics,
} from '../../src/present/components/ScrollablePanel.tsx'

describe('scrollable panel metrics', () => {
  it('uses the full height when content fits', () => {
    expect(scrollMetrics(8, 6, 3)).toEqual({
      offset: 0,
      maxOffset: 0,
      viewportRows: 8,
      overflowing: false,
    })
  })

  it('reserves stable overflow indicators and clamps the offset', () => {
    expect(scrollMetrics(8, 12, 99)).toEqual({
      offset: 6,
      maxOffset: 6,
      viewportRows: 6,
      overflowing: true,
    })
  })

  it('keeps very small containers usable without indicator rows', () => {
    expect(scrollMetrics(2, 5, 1)).toEqual({
      offset: 1,
      maxOffset: 3,
      viewportRows: 2,
      overflowing: true,
    })
  })

  it('clips rendered children to the controlled row window', async () => {
    const stdout = new CaptureStream(30, 8)
    const screen = render(
      React.createElement(
        Box,
        { width: 20, height: 5 },
        React.createElement(
          ScrollablePanel,
          {
            height: 5,
            scrollOffset: 2,
            upHint: 'Alt+↑',
            downHint: 'Alt+↓',
            children: Array.from({ length: 8 }, (_, index) =>
              React.createElement(Text, { key: index }, `line-${index + 1}`),
            ),
          },
        ),
      ),
      {
        stdout: stdout as unknown as NodeJS.WriteStream,
        debug: true,
        patchConsole: false,
        exitOnCtrlC: false,
      },
    )

    await flush()
    screen.unmount()
    await flush()
    screen.cleanup()

    const output = stdout.output.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
    expect(output).toContain('↑ Alt+↑ · 2\nline-3\nline-4\nline-5\n↓ Alt+↓ · 3')
  })
})

function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
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
