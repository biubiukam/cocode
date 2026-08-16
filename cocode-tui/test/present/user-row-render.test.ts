import { Writable } from 'node:stream'
import React from 'react'
import { Box, render } from 'ink'
import stringWidth from 'string-width'
import { afterEach, describe, expect, it } from 'vitest'
import type { ConversationNode } from '../../src/runtime/nodes/types.ts'
import { MessageList } from '../../src/present/components/MessageList.tsx'
import { setTheme } from '../../src/present/theme.ts'

const ANSI_PATTERN = /\u001b\[[0-?]*[ -/]*[@-~]/g
const WIDTHS = [40, 60, 80, 120] as const

describe('UserRow rendering', () => {
  afterEach(() => setTheme('dark'))

  it.each(WIDTHS)('stays within %i columns for representative terminal text', async (maxColumns) => {
    for (const text of [
      'single line',
      'first line\nsecond line',
      '',
      '中文消息会按照终端单元格宽度换行',
      'emoji 👩🏽‍💻 combines accents cafe\u0301 and stays visible',
      'x'.repeat(maxColumns * 2),
    ]) {
      const output = await renderUserMessage({ text, maxColumns })
      const lines = visibleLines(output)

      expect(lines.length).toBeGreaterThanOrEqual(2)
      expect(Math.max(...lines.map((line) => stringWidth(line)))).toBeLessThanOrEqual(maxColumns)
      expect(output).not.toContain('◆')
      expect(lines.some((line) => line.includes('│'))).toBe(true)
    }
  })

  it('keeps one left border and replaces it with a strong rail when selected', async () => {
    const normal = visibleLines(await renderUserMessage({ text: 'selected prompt', maxColumns: 40 }))
    const selected = visibleLines(
      await renderUserMessage({
        text: 'selected prompt',
        maxColumns: 40,
        selectedNodeId: 'user:user-1',
      }),
    )

    expect(normal.filter((line) => line.includes('│')).length).toBeGreaterThanOrEqual(2)
    expect(normal.every((line) => !/[┌┐└┘─]/u.test(line))).toBe(true)
    expect(selected.filter((line) => line.includes('▌')).length).toBeGreaterThanOrEqual(2)
    expect(selected.every((line) => !/[┌┐└┘─]/u.test(line))).toBe(true)
    expect(Math.max(...selected.map((line) => stringWidth(line)))).toBeLessThanOrEqual(40)
  })

  it.each(WIDTHS)('wraps rather than truncates an unbreakable message at %i columns', async (maxColumns) => {
    const text = '0123456789'.repeat(24)
    const output = await renderUserMessage({ text, maxColumns })

    expect(output.replace(/[^0-9]/g, '').length).toBeGreaterThanOrEqual(text.length)
  })

  it('preserves wide and combined graphemes without a role label', async () => {
    const output = await renderUserMessage({
      text: '中文 👩🏽‍💻 cafe\u0301',
      maxColumns: 40,
      locale: 'zh',
    })

    expect(output).toContain('中文')
    expect(output).toContain('👩🏽‍💻')
    expect(output).toContain('cafe\u0301')
  })

  it('keeps the structural user marker in light, dark, and colorless output', async () => {
    for (const themeName of ['dark', 'light'] as const) {
      setTheme(themeName)
      const output = visibleLines(
        await renderUserMessage({ text: 'theme proof', maxColumns: 40, noColor: true }),
      ).join('\n')

      expect(output).toContain('│ theme proof')
      expect(output).not.toContain('◆')
    }
  })
})

async function renderUserMessage(options: {
  text: string
  maxColumns: number
  selectedNodeId?: string
  noColor?: boolean
  locale?: 'en' | 'zh'
}): Promise<string> {
  const stdout = new CaptureStream(options.maxColumns, 30, options.noColor === true ? 1 : 8)
  const nodes: readonly ConversationNode[] = [
    {
      kind: 'user',
      id: 'user-1',
      seq: 1,
      time: 1,
      text: options.text,
    },
  ]
  const app = render(
    React.createElement(
      Box,
      { width: options.maxColumns },
      React.createElement(MessageList, {
        nodes,
        verbose: false,
        maxRows: 20,
        locale: options.locale ?? 'en',
        maxColumns: options.maxColumns,
        selectedNodeId: options.selectedNodeId,
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
  return stdout.output.replace(ANSI_PATTERN, '')
}

function visibleLines(output: string): string[] {
  return output.split('\n').filter((line) => line.length > 0)
}

class CaptureStream extends Writable {
  readonly isTTY = true

  output = ''

  constructor(
    readonly columns: number,
    readonly rows: number,
    readonly colorDepth: number,
  ) {
    super()
  }

  getColorDepth(): number {
    return this.colorDepth
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
