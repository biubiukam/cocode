import { PassThrough, Writable } from 'node:stream'
import React from 'react'
import type { TuiRuntime } from '@cocode/tui-connection'
import { render } from 'ink'
import { describe, expect, it } from 'vitest'
import {
  Inspector,
} from '../../src/present/components/Inspector.tsx'
import { createTuiApp, type TuiSnapshot } from '../../src/runtime/app.ts'

describe('Inspector', () => {
  it('does not render diagnostic skills or capability sections', async () => {
    const snapshot = createSnapshot(47)

    const stdin = new InputStream()
    const stdout = new CaptureStream(30, 40)
    const screen = render(
      React.createElement(Inspector, {
        snapshot,
        locale: 'en',
        maxRows: 40,
      }),
      {
        stdin: stdin as unknown as NodeJS.ReadStream,
        stdout: stdout as unknown as NodeJS.WriteStream,
        debug: true,
        patchConsole: false,
        exitOnCtrlC: false,
      },
    )

    await flush()
    await flush()
    screen.unmount()
    await flush()
    screen.cleanup()

    const output = stdout.output.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
    expect(output).not.toContain('Skills')
    expect(output).not.toContain('Capabilities')
  })
})

function createSnapshot(skillCount: number): TuiSnapshot {
  const runtime: TuiRuntime = {
    async start() {
      return { name: 'test-runtime', version: '0' }
    },
    async restart() {
      return { name: 'test-runtime', version: '0' }
    },
    async prompt() {
      return 'message-1'
    },
    async cancel() {
      return true
    },
    async open() {
      return true
    },
    async fork() {
      return { sessionId: 'session-2', seedLength: 0, seed: [] }
    },
    async rewind() {
      return { sessionId: 'session-1', seedLength: 0, seed: [] }
    },
    subscribe() {
      return () => {}
    },
    async close() {},
  }
  const app = createTuiApp({
    runtime,
    cwd: '/tmp',
    provider: 'test-provider',
    model: 'test-model',
    sessionId: 'session-1',
  })
  return {
    ...app.snapshot(),
    skills: Array.from({ length: skillCount }, (_, index) => ({
      name: `skill-${index + 1}`,
      description: `Skill ${index + 1}`,
    })),
  }
}

function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

class InputStream extends PassThrough {
  readonly isTTY = true

  isRaw = false

  setRawMode(value: boolean): this {
    this.isRaw = value
    return this
  }

  ref(): this {
    return this
  }

  unref(): this {
    return this
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
