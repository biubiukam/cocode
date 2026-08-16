import { PassThrough, Writable } from 'node:stream'
import React from 'react'
import { render } from 'ink'
import stringWidth from 'string-width'
import type { TuiAction, TuiApp, TuiSnapshot } from '../../src/runtime/app.ts'
import { createTuiApp } from '../../src/runtime/app.ts'
import type { Keymap } from '../../src/runtime/keymap.ts'
import type { ConversationNode } from '../../src/runtime/nodes/types.ts'
import { Chat } from '../../src/present/chat.tsx'
import { setTheme, type ThemeName } from '../../src/present/theme.ts'
import type { TuiRuntime } from '@cocode/tui-connection'

export type RenderViewport = {
  columns: number
  rows: number
}

export type ChatRenderCase = {
  name: string
  viewport: RenderViewport
  locale: 'en' | 'zh'
  theme: ThemeName
  keymap: Keymap
  snapshot: TuiSnapshot
}

export type RenderRegion =
  | 'header'
  | 'transcript'
  | 'task'
  | 'status'
  | 'overlay'
  | 'composer'
  | 'footer'
  | 'inspector'

export const CONTRACT_MARKERS = {
  header: '[header] render-contract',
  transcript: '[transcript]',
  task: '[task]',
  status: '[status]',
  overlay: '[overlay]',
  composer: '[composer]',
} as const

const ANSI_PATTERN = /\u001b\[[0-?]*[ -/]*[@-~]/g
const FRAME_BOUNDARY = '\u001b[?25l'

export function stripAnsi(value: string): string {
  return value.replace(ANSI_PATTERN, '')
}

export function visibleWidth(value: string): number {
  return stringWidth(stripAnsi(value))
}

export function frameLines(frame: string): string[] {
  return stripAnsi(frame).replaceAll('\r', '').split('\n')
}

export function normalizeGolden(frame: string): string {
  const lines = frameLines(frame)
  while (lines.at(-1) === '') lines.pop()
  return `${lines.map((line) => line.trimEnd()).join('\n')}\n`
}

export function regionLine(frame: string, region: RenderRegion): number | undefined {
  const lines = frameLines(frame)
  if (region === 'footer') {
    const lastContentLine = lines.findLastIndex((line) => line.trim() !== '')
    return lastContentLine < 0 ? undefined : lastContentLine
  }
  const indexes = lines.flatMap((line, index) =>
    lineMatchesRegion(line, region) ? [index] : [],
  )
  if (indexes.length === 0) return undefined
  return region === 'status' ? indexes.at(-1) : indexes[0]
}

export function assertViewportWidth(
  frame: string,
  testCase: Pick<ChatRenderCase, 'name' | 'viewport'>,
): void {
  const overflow = frameLines(frame)
    .map((line, index) => ({ line, index, width: visibleWidth(line) }))
    .filter(({ width }) => width >= testCase.viewport.columns)
  if (overflow.length === 0) return
  const details = overflow
    .map(({ line, index, width }) =>
      `line ${String(index + 1)} (${String(width)} cells): ${JSON.stringify(line)}`,
    )
    .join('\n')
  throw new Error(
    `${testCase.name} at ${String(testCase.viewport.columns)}x${String(testCase.viewport.rows)} exceeded the viewport:\n${details}`,
  )
}

export function createFixtureSnapshot(
  overrides: Partial<Omit<TuiSnapshot, 'header' | 'composer' | 'status' | 'runtimeInfo'>> & {
    header?: Partial<TuiSnapshot['header']>
    composer?: Partial<TuiSnapshot['composer']>
    status?: Partial<TuiSnapshot['status']> & {
      telemetry?: Partial<TuiSnapshot['status']['telemetry']>
    }
    runtimeInfo?: Partial<TuiSnapshot['runtimeInfo']>
  } = {},
): TuiSnapshot {
  const base = createTuiApp({
    runtime: FIXTURE_RUNTIME,
    cwd: `/workspace/${CONTRACT_MARKERS.header}`,
    provider: 'fixture-provider',
    model: 'fixture-model',
    sessionId: 'fixture-00000000',
    locale: overrides.locale ?? 'en',
  }).snapshot()
  return {
    ...base,
    ...overrides,
    header: { ...base.header, ...overrides.header },
    composer: {
      ...base.composer,
      placeholder: `${CONTRACT_MARKERS.composer} describe a task`,
      ...overrides.composer,
    },
    status: {
      ...base.status,
      line: `${CONTRACT_MARKERS.status} ready`,
      ...overrides.status,
      telemetry: {
        ...base.status.telemetry,
        ...overrides.status?.telemetry,
      },
    },
    runtimeInfo: { ...base.runtimeInfo, ...overrides.runtimeInfo },
  }
}

export function fixtureNodes(options: { long?: boolean; streaming?: boolean } = {}): ConversationNode[] {
  const repeated = options.long
    ? ' 中文宽字符 🧑‍💻 e\u0301 responsive-contract'.repeat(12)
    : ''
  return [
    {
      kind: 'user',
      id: 'fixture-user',
      seq: 1,
      time: 1_786_838_396_000,
      text: `${CONTRACT_MARKERS.transcript} inspect the terminal layout${repeated}`,
    },
    {
      kind: 'assistant',
      id: 'fixture-assistant',
      seq: 2,
      time: 1_786_838_397_000,
      turn: 1,
      step: 1,
      text: `The render contract is ${options.streaming === true ? 'streaming' : 'stable'}.${repeated}`,
      reasoning: `Stable fixture reasoning.${repeated}`,
      streaming: options.streaming === true,
    },
    {
      kind: 'tool',
      id: 'fixture-tool',
      seq: 3,
      time: 1_786_838_398_000,
      callId: 'fixture-call',
      name: 'read',
      args: '{"path":"/workspace/very/long/路径/README.md"}',
      status: options.streaming === true ? 'running' : 'success',
      view: { kind: 'read', path: '/workspace/very/long/路径/README.md' },
      result: 'fixture result',
    },
  ]
}

export async function renderChatContract(testCase: ChatRenderCase): Promise<ChatRenderHandle> {
  setTheme(testCase.theme)
  const stdin = new InputStream()
  const stdout = new CaptureStream(testCase.viewport.columns, testCase.viewport.rows)
  const stderr = new CaptureStream(testCase.viewport.columns, testCase.viewport.rows)
  const fixtureApp = createSnapshotApp(testCase.snapshot)
  const element = () => React.createElement(Chat, {
    app: fixtureApp.app,
    keymap: testCase.keymap,
    mouseSupported: false,
  })
  const screen = render(element(), {
    stdin: stdin as unknown as NodeJS.ReadStream,
    stdout: stdout as unknown as NodeJS.WriteStream,
    stderr: stderr as unknown as NodeJS.WriteStream,
    debug: true,
    patchConsole: false,
    exitOnCtrlC: false,
  })
  await settle()

  return {
    get frame() {
      return latestFrame(stdout.output)
    },
    get stderr() {
      return stripAnsi(stderr.output)
    },
    get dispatches() {
      return fixtureApp.dispatches
    },
    async write(input: string) {
      stdin.write(input)
      await settle()
    },
    async resize(viewport: RenderViewport) {
      stdout.columns = viewport.columns
      stdout.rows = viewport.rows
      stderr.columns = viewport.columns
      stderr.rows = viewport.rows
      screen.rerender(element())
      await settle()
      return latestFrame(stdout.output)
    },
    async close() {
      screen.unmount()
      await settle()
      screen.cleanup()
      setTheme('dark')
    },
  }
}

export type ChatRenderHandle = {
  readonly frame: string
  readonly stderr: string
  readonly dispatches: readonly TuiAction[]
  write(input: string): Promise<void>
  resize(viewport: RenderViewport): Promise<string>
  close(): Promise<void>
}

function lineMatchesRegion(line: string, region: RenderRegion): boolean {
  switch (region) {
    case 'header':
    case 'transcript':
      return line.includes(CONTRACT_MARKERS.transcript) || line.includes('/workspace/very/long')
    case 'task':
    case 'status':
    case 'overlay':
      return line.includes(CONTRACT_MARKERS[region])
    case 'composer':
      return (
        line.includes(CONTRACT_MARKERS.composer) ||
        line.includes('│ Build') ||
        line.includes('│ Plan') ||
        line.includes('│ 构建') ||
        line.includes('│ 计划') ||
        line.startsWith('Build') ||
        line.startsWith('Plan') ||
        line.startsWith('构建') ||
        line.startsWith('计划')
      )
    case 'footer':
      return false
    case 'inspector':
      return (
        line.includes('⇄ inspector') ||
        line.includes('⇄ Inspector') ||
        line.includes('⇄ 检查器') ||
        line.includes('⇄ 详情')
      )
  }
}

function latestFrame(output: string): string {
  const frames = output.split(FRAME_BOUNDARY)
  const plain = stripAnsi(frames.at(-1) ?? output).replaceAll('\r', '')
  const marker = plain.lastIndexOf(CONTRACT_MARKERS.header)
  return marker < 0 ? plain : plain.slice(marker)
}

function createSnapshotApp(initial: TuiSnapshot): {
  app: TuiApp
  dispatches: TuiAction[]
} {
  const listeners = new Set<() => void>()
  const dispatches: TuiAction[] = []
  return {
    dispatches,
    app: {
      async start() {},
      async close() {},
      snapshot: () => initial,
      subscribe(listener) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      dispatch(action) {
        dispatches.push(action)
      },
    },
  }
}

function settle(): Promise<void> {
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
    public columns: number,
    public rows: number,
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

const FIXTURE_RUNTIME: TuiRuntime = {
  async start() {
    return { name: 'fixture-runtime', version: '0' }
  },
  async prompt() {
    return 'fixture-message'
  },
  subscribe() {
    return () => {}
  },
  async close() {},
}
