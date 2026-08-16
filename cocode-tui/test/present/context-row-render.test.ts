import { Writable } from 'node:stream'
import React from 'react'
import { Box, render } from 'ink'
import { describe, expect, it } from 'vitest'
import type { ContextNode } from '../../src/runtime/nodes/types.ts'
import { ContextRow } from '../../src/present/components/ContextRow.tsx'

const node: ContextNode = {
  kind: 'context',
  id: 'context-1',
  seq: 1,
  time: 1,
  text: 'Current runtime context.',
  source: { kind: 'plugin', plugin: '@deepseek-ai/dsh-system-prompt' },
  provenance: { role: 'inject', label: '@deepseek-ai/dsh-system-prompt' },
  form: 'snapshot',
  sections: [{ name: 'sandbox:policy', text: 'danger-full-access' }],
}

describe('ContextRow rendering', () => {
  it('uses a dedicated collapsed context presentation', async () => {
    const output = await renderRow(false)
    expect(output).toContain('context injection')
    expect(output).toContain('@deepseek-ai/dsh-system-prompt')
    expect(output).not.toContain('snapshot')
    expect(output).not.toContain('sandbox:policy')
    expect(output).not.toContain('you')
  })

  it('renders named snapshot sections when expanded', async () => {
    const output = await renderRow(true)
    expect(output).toContain('sandbox:policy')
    expect(output).toContain('danger-full-access')
  })
})

async function renderRow(expanded: boolean): Promise<string> {
  const stdout = new CaptureStream(100, 20)
  const app = render(
    React.createElement(
      Box,
      { width: 100 },
      React.createElement(ContextRow, { node, expanded, locale: 'en' }),
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
  return stdout.output.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
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
  ) {
    this.output += chunk.toString()
    callback()
  }
}
