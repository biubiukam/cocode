import { Writable } from 'node:stream'
import React from 'react'
import { Box, render } from 'ink'
import { describe, expect, it } from 'vitest'
import { text } from '../../src/runtime/ui-locale.ts'
import { EmptyState } from '../../src/present/components/EmptyState.tsx'

describe('empty state copy', () => {
  it('has localized title and hint', () => {
    expect(text('en', 'emptyTitle')).toBe('cocode is ready')
    expect(text('zh', 'emptyTitle')).toBe('cocode 已准备好')
    expect(text('zh', 'emptyHint')).toContain('开始工作')
  })

  it('keeps the horizontal wordmark and title on separate rows', async () => {
    const stdout = new CaptureStream(73, 9)
    const app = render(
      React.createElement(
        Box,
        { width: 73, height: 9 },
        React.createElement(EmptyState, { maxRows: 9, maxColumns: 73, locale: 'en' }),
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

    const lines = stdout.output.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '').split('\n')
    const titleLine = lines.find((line) => line.includes('cocode is ready'))
    expect(titleLine).toBeDefined()
    expect(titleLine).not.toContain('█')
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
