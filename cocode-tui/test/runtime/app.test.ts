import { describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { TuiNotification, TuiRuntime } from '@cocode/tui-connection'
import { createTuiApp } from '../../src/runtime/app.ts'
import { P0_CAPABILITIES } from '../../src/runtime/capabilities.ts'

function fakeRuntime(): TuiRuntime & {
  prompts: { sessionId: string; text: string }[]
  emit: (n: TuiNotification) => void
  emitClose: (error?: string) => void
  closeCount: number
  restarts: { provider: string; model: string }[]
  failStart?: Error
  failRestartModels: Set<string>
} {
  const handlers = new Set<(n: TuiNotification) => void>()
  const closeHandlers = new Set<(error?: string) => void>()
  const runtime: TuiRuntime & {
    prompts: { sessionId: string; text: string }[]
    emit: (n: TuiNotification) => void
    failStart?: Error
  } = {
    prompts: [],
    closeCount: 0,
    restarts: [],
    failRestartModels: new Set(),
    emit(n) {
      for (const handler of handlers) handler(n)
    },
    emitClose(error) {
      for (const handler of closeHandlers) handler(error)
    },
    async start() {
      if (runtime.failStart) throw runtime.failStart
      return { name: 'fake-runtime', version: '0' }
    },
    async restart(init) {
      runtime.restarts.push({
        provider: init.provider,
        model: init.model,
      })
      if (runtime.failRestartModels.delete(init.model)) {
        throw new Error(`failed to start ${init.model}`)
      }
      await runtime.close()
      return runtime.start()
    },
    async prompt(sessionId, blocks) {
      const text = typeof blocks[0]?.text === 'string' ? blocks[0].text : ''
      runtime.prompts.push({ sessionId, text })
      return 'mid-1'
    },
    subscribe(handler) {
      handlers.add(handler)
      return () => {
        handlers.delete(handler)
      }
    },
    onClose(handler) {
      closeHandlers.add(handler)
      return () => closeHandlers.delete(handler)
    },
    async close() {
      runtime.closeCount += 1
    },
  }
  return runtime
}

describe('TuiApp', () => {
  it('switches interface language with /lang', async () => {
    const app = createTuiApp({
      runtime: fakeRuntime(),
      cwd: '/tmp',
      provider: 'deepseek-official',
      model: 'deepseek-v4-flash',
      sessionId: 's1',
      locale: 'en',
    })
    await app.start()
    app.dispatch({ type: 'command', line: '/lang zh' })
    expect(app.snapshot().locale).toBe('zh')
    expect(app.snapshot().composer.placeholder).toContain('输入消息')
  })

  it('switches model through runtime restart and starts a new session', async () => {
    const runtime = fakeRuntime()
    const app = createTuiApp({
      runtime,
      cwd: '/tmp',
      provider: 'deepseek-official',
      model: 'm1',
      sessionId: 's1',
    })
    await app.start()
    app.dispatch({ type: 'command', line: '/model m2' })
    await expect.poll(() => app.snapshot().header.model).toBe('m2')
    expect(runtime.restarts).toEqual([{ provider: 'deepseek-official', model: 'm2' }])
    expect(app.snapshot().header.sessionId).not.toBe('s1')
    expect(app.snapshot().agent).toBe('idle')
  })

  it('restores the previous model when switching fails', async () => {
    const runtime = fakeRuntime()
    runtime.failRestartModels.add('m2')
    const app = createTuiApp({
      runtime,
      cwd: '/tmp',
      provider: 'deepseek-official',
      model: 'm1',
      sessionId: 's1',
      locale: 'zh',
    })
    await app.start()
    app.dispatch({ type: 'command', line: '/model m2' })
    await expect.poll(() => app.snapshot().agent).toBe('idle')
    expect(runtime.restarts).toEqual([
      { provider: 'deepseek-official', model: 'm2' },
      { provider: 'deepseek-official', model: 'm1' },
    ])
    expect(app.snapshot().header.model).toBe('m1')
    expect(app.snapshot().header.sessionId).toBe('s1')
    expect(app.snapshot().notice?.message).toBe('模型切换失败，已恢复为 m1。')
  })

  it('resumes a searchable local session from its event log', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cocode-resume-root-'))
    const cwd = await mkdtemp(join(tmpdir(), 'cocode-resume-cwd-'))
    try {
      const sessionDir = join(root, 'project', 'old-session')
      await mkdir(sessionDir, { recursive: true })
      await writeFile(
        join(sessionDir, 'session.jsonl'),
        `${JSON.stringify({
          type: 'session',
          id: 'old-session',
          createdAt: 1_700_000_000_000,
          cwd,
        })}\n${JSON.stringify({
          type: 'user/message',
          seq: 1,
          time: 1_700_000_000_001,
          data: {
            id: 'old-user',
            role: 'user',
            content: [{ type: 'text', text: 'continue this session' }],
            source: { kind: 'user' },
          },
        })}\n`,
      )
      const app = createTuiApp({
        runtime: fakeRuntime(),
        cwd,
        provider: 'p',
        model: 'm',
        sessionId: 'current-session',
        capabilities: { ...P0_CAPABILITIES, sessionList: 'jsonl' },
        diagnostics: {
          tty: true,
          launchConfigured: true,
          argsConfigured: true,
          sessionRoot: root,
        },
        locale: 'zh',
      })
      await app.start()
      app.dispatch({ type: 'command', line: '/resume' })
      await expect.poll(() => app.snapshot().resumePicker?.open).toBe(true)
      expect(app.snapshot().resumePicker?.items.map((item) => item.id)).toEqual(['old-session'])
      app.dispatch({ type: 'resume.setQuery', query: 'old' })
      expect(app.snapshot().resumePicker?.query).toBe('old')
      app.dispatch({ type: 'resume.confirm' })
      expect(app.snapshot().resumePicker?.open).toBe(false)
      await expect.poll(() => app.snapshot().header.sessionId).toBe('old-session')
      expect(app.snapshot().nodes[0]).toMatchObject({
        kind: 'user',
        text: 'continue this session',
      })
      expect(app.snapshot().notice?.message).toBe('已恢复会话 old-sess。')
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(cwd, { recursive: true, force: true })
    }
  })

  it('prompts only when idle', async () => {
    const runtime = fakeRuntime()
    const app = createTuiApp({
      runtime,
      cwd: '/tmp',
      provider: 'deepseek-official',
      model: 'deepseek-v4-flash',
      sessionId: 's1',
    })
    await app.start()
    app.dispatch({ type: 'submit', text: 'hello' })
    expect(runtime.prompts).toEqual([{ sessionId: 's1', text: 'hello' }])
    runtime.emit({
      method: 'session.status',
      params: { sessionId: 's1', status: 'running' },
    })
    app.dispatch({ type: 'submit', text: 'again' })
    expect(runtime.prompts).toHaveLength(1)
    expect(app.snapshot().notice?.message).toMatch(/Turn in progress/)
  })

  it('sends /compact through the prompt path', async () => {
    const runtime = fakeRuntime()
    const app = createTuiApp({
      runtime,
      cwd: '/tmp',
      provider: 'p',
      model: 'm',
      sessionId: 's1',
    })
    await app.start()
    app.dispatch({ type: 'command', line: '/compact' })
    await vi.waitFor(() => expect(runtime.prompts).toHaveLength(1))
    expect(runtime.prompts[0]).toEqual({ sessionId: 's1', text: '/compact' })
  })

  it('queues a follow-up while running and sends it after idle', async () => {
    const runtime = fakeRuntime()
    const app = createTuiApp({
      runtime,
      cwd: '/tmp',
      provider: 'p',
      model: 'm',
      sessionId: 's1',
    })
    await app.start()
    app.dispatch({ type: 'submit', text: 'first' })
    runtime.emit({
      method: 'session.status',
      params: { sessionId: 's1', status: 'running' },
    })
    app.dispatch({ type: 'setDraft', text: 'second' })
    app.dispatch({ type: 'queuePrompt' })
    expect(app.snapshot().status.queueCount).toBe(1)
    expect(runtime.prompts).toEqual([{ sessionId: 's1', text: 'first' }])
    runtime.emit({
      method: 'session.status',
      params: { sessionId: 's1', status: 'idle' },
    })
    await expect
      .poll(() => runtime.prompts)
      .toEqual([
        { sessionId: 's1', text: 'first' },
        { sessionId: 's1', text: 'second' },
      ])
    expect(app.snapshot().status.queueCount).toBe(0)
  })

  it('ingests session.event into nodes', async () => {
    const runtime = fakeRuntime()
    const app = createTuiApp({
      runtime,
      cwd: '/tmp',
      provider: 'p',
      model: 'm',
      sessionId: 's1',
    })
    await app.start()
    runtime.emit({
      method: 'session.event',
      params: {
        sessionId: 's1',
        event: {
          type: 'user/message',
          seq: 1,
          time: 1,
          data: {
            id: 'u1',
            role: 'user',
            content: [{ type: 'text', text: 'hi' }],
            source: { kind: 'user' },
          },
        },
      },
    })
    expect(app.snapshot().nodes[0]).toMatchObject({ kind: 'user', text: 'hi' })
  })

  it('ignores events for other sessions', async () => {
    const runtime = fakeRuntime()
    const app = createTuiApp({
      runtime,
      cwd: '/tmp',
      provider: 'p',
      model: 'm',
      sessionId: 's1',
    })
    await app.start()
    runtime.emit({
      method: 'session.event',
      params: {
        sessionId: 'other',
        event: {
          type: 'user/message',
          seq: 1,
          time: 1,
          data: {
            id: 'u1',
            content: [{ type: 'text', text: 'nope' }],
          },
        },
      },
    })
    expect(app.snapshot().nodes).toEqual([])
  })

  it('arms interrupt then quits on the second press', async () => {
    const runtime = fakeRuntime()
    const app = createTuiApp({
      runtime,
      cwd: '/tmp',
      provider: 'p',
      model: 'm',
      sessionId: 's1',
    })
    await app.start()
    runtime.emit({
      method: 'session.status',
      params: { sessionId: 's1', status: 'running' },
    })
    app.dispatch({ type: 'interruptOrQuit' })
    expect(app.snapshot().exiting).toBe(false)
    expect(app.snapshot().notice?.message).toMatch(/cannot cancel/)
    app.dispatch({ type: 'interruptOrQuit' })
    expect(app.snapshot().exiting).toBe(true)
  })

  it('requires two idle interrupts to quit', async () => {
    const runtime = fakeRuntime()
    const app = createTuiApp({
      runtime,
      cwd: '/tmp',
      provider: 'p',
      model: 'm',
      sessionId: 's1',
    })
    await app.start()
    app.dispatch({ type: 'interruptOrQuit' })
    expect(app.snapshot().exiting).toBe(false)
    expect(app.snapshot().notice?.message).toMatch(/Press again/)
    app.dispatch({ type: 'interruptOrQuit' })
    expect(app.snapshot().exiting).toBe(true)
  })

  it('marks dead when initialize fails', async () => {
    const runtime = fakeRuntime()
    runtime.failStart = new Error('no lib/')
    const app = createTuiApp({
      runtime,
      cwd: '/tmp',
      provider: 'p',
      model: 'm',
    })
    await app.start()
    expect(app.snapshot().agent).toBe('dead')
    expect(app.snapshot().notice?.tone).toBe('error')
  })

  it('/new changes session id and clears nodes', async () => {
    const runtime = fakeRuntime()
    const app = createTuiApp({
      runtime,
      cwd: '/tmp',
      provider: 'p',
      model: 'm',
      sessionId: 's1',
    })
    await app.start()
    runtime.emit({
      method: 'session.event',
      params: {
        sessionId: 's1',
        event: {
          type: 'user/message',
          seq: 1,
          time: 1,
          data: { id: 'u1', content: [{ type: 'text', text: 'x' }] },
        },
      },
    })
    app.dispatch({ type: 'command', line: '/new' })
    const snap = app.snapshot()
    expect(snap.header.sessionId).not.toBe('s1')
    expect(snap.nodes).toEqual([])
  })

  it('edits the draft around a cursor', async () => {
    const runtime = fakeRuntime()
    const app = createTuiApp({
      runtime,
      cwd: '/tmp',
      provider: 'p',
      model: 'm',
    })
    await app.start()
    app.dispatch({ type: 'setDraft', text: 'ac' })
    app.dispatch({ type: 'moveCursor', delta: -1 })
    app.dispatch({ type: 'insertDraft', text: 'b' })
    expect(app.snapshot().composer).toMatchObject({ text: 'abc', cursor: 2 })
    app.dispatch({ type: 'deleteBackward' })
    expect(app.snapshot().composer).toMatchObject({ text: 'ac', cursor: 1 })
  })

  it('appends selected file content when submitting a prompt', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'cocode-app-context-'))
    try {
      await writeFile(join(cwd, 'README.md'), '# Cocode\n')
      const runtime = fakeRuntime()
      const app = createTuiApp({
        runtime,
        cwd,
        provider: 'p',
        model: 'm',
        sessionId: 's1',
      })
      await app.start()
      app.dispatch({ type: 'setDraft', text: 'review @README.md' })
      app.dispatch({ type: 'attachFile', start: 7, end: 17, path: 'README.md' })
      expect(app.snapshot().composer.attachments).toEqual(['README.md'])
      app.dispatch({ type: 'submit', text: app.snapshot().composer.text })
      await vi.waitFor(() => expect(runtime.prompts).toHaveLength(1))
      expect(runtime.prompts[0]?.text).toContain('[Attached file: README.md]')
      expect(runtime.prompts[0]?.text).toContain('# Cocode')
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })

  it('marks the app dead when the runtime transport closes', async () => {
    const runtime = fakeRuntime()
    const app = createTuiApp({
      runtime,
      cwd: '/tmp',
      provider: 'p',
      model: 'm',
    })
    await app.start()
    runtime.emitClose('stderr tail')
    expect(app.snapshot().agent).toBe('dead')
    expect(app.snapshot().composer.disabled).toBe(true)
    expect(app.snapshot().notice?.message).toMatch(/stderr tail/)
  })

  it('closes the runtime once for repeated quit actions', async () => {
    const runtime = fakeRuntime()
    const app = createTuiApp({
      runtime,
      cwd: '/tmp',
      provider: 'p',
      model: 'm',
    })
    await app.start()
    app.dispatch({ type: 'quit' })
    app.dispatch({ type: 'quit' })
    await app.close()
    expect(runtime.closeCount).toBe(1)
    expect(app.snapshot().exiting).toBe(true)
  })

  it('shows the latest assistant usage without inventing zeroes', async () => {
    const runtime = fakeRuntime()
    const app = createTuiApp({
      runtime,
      cwd: '/tmp',
      provider: 'p',
      model: 'm',
      sessionId: 's1',
    })
    await app.start()
    runtime.emit({
      method: 'session.event',
      params: {
        sessionId: 's1',
        event: {
          type: 'assistant/message',
          seq: 1,
          time: 1,
          data: {
            turn: 1,
            step: 1,
            message: { content: [{ type: 'text', text: 'done' }] },
            usage: { inputTokens: 12, outputTokens: 4 },
          },
        },
      },
    })
    expect(app.snapshot().status.tokens).toEqual({ input: 12, output: 4 })
  })

  it('projects optional telemetry events into status and clears it for /new', async () => {
    const runtime = fakeRuntime()
    const app = createTuiApp({
      runtime,
      cwd: '/tmp',
      provider: 'p',
      model: 'm',
      sessionId: 's1',
    })
    await app.start()
    runtime.emit({
      method: 'session.event',
      params: {
        sessionId: 's1',
        event: {
          type: 'request/context',
          seq: 1,
          time: 1,
          data: { contextWindow: 100 },
        },
      },
    })
    runtime.emit({
      method: 'session.event',
      params: {
        sessionId: 's1',
        event: {
          type: 'assistant/message',
          seq: 2,
          time: 2,
          data: {
            message: { content: [{ type: 'text', text: 'done' }] },
            usage: { inputTokens: 20, outputTokens: 5, cacheReadTokens: 30 },
          },
        },
      },
    })
    expect(app.snapshot().status.telemetry).toMatchObject({
      contextWindow: 100,
      contextPercent: 50,
      usage: { input: 20, output: 5, cacheRead: 30 },
    })
    app.dispatch({ type: 'command', line: '/new' })
    expect(app.snapshot().status.telemetry).toEqual({
      totals: { input: 0, output: 0 },
      tpsSamples: [],
      contextSegments: {
        system: 0,
        prompt: 0,
        assistant: 0,
        thinking: 0,
        tools: 0,
      },
    })
  })

  it('projects goal and todo events into status', async () => {
    const runtime = fakeRuntime()
    const app = createTuiApp({
      runtime,
      cwd: '/tmp',
      provider: 'p',
      model: 'm',
      sessionId: 's1',
    })
    await app.start()
    runtime.emit({
      method: 'session.event',
      params: {
        sessionId: 's1',
        event: {
          type: 'todo/write',
          seq: 1,
          time: 1,
          data: {
            todos: [
              { content: 'one', status: 'completed' },
              { content: 'two', status: 'pending' },
            ],
          },
        },
      },
    })
    runtime.emit({
      method: 'session.event',
      params: {
        sessionId: 's1',
        event: {
          type: 'goal/change',
          seq: 2,
          time: 2,
          data: {
            operation: 'create',
            goal: {
              id: 'g1',
              revision: 1,
              objective: 'ship',
              phase: 'active',
              maxGoalRounds: 3,
              roundsStarted: 0,
            },
          },
        },
      },
    })
    expect(app.snapshot().status.todos).toEqual([
      { content: 'one', status: 'completed' },
      { content: 'two', status: 'pending' },
    ])
    expect(app.snapshot().status.goal?.phase).toBe('active')
  })

  it('projects subagent lifecycle into status without leaking other sessions', async () => {
    const runtime = fakeRuntime()
    const app = createTuiApp({
      runtime,
      cwd: '/tmp',
      provider: 'p',
      model: 'm',
      sessionId: 's1',
      locale: 'zh',
    })
    await app.start()
    runtime.emit({
      method: 'subagent.started',
      params: { parentSessionId: 'other', childSessionId: 'ignored' },
    })
    expect(app.snapshot().status.subagents?.running).toBe(0)
    runtime.emit({
      method: 'subagent.started',
      params: { parentSessionId: 's1', childSessionId: 'child-1' },
    })
    expect(app.snapshot().status.subagents).toEqual({
      running: 1,
      last: { id: 'child-1', event: 'started' },
    })
    runtime.emit({
      method: 'subagent.finished',
      params: {
        parentSessionId: 's1',
        childSessionId: 'child-1',
        provider: 'p',
        agentId: 'a1',
        status: 'ok',
      },
    })
    expect(app.snapshot().status.subagents).toEqual({
      running: 0,
      last: { id: 'child-1', event: 'finished' },
    })
  })

  it('doctor redacts credentials and reports launch state', async () => {
    const runtime = fakeRuntime()
    runtime.failStart = new Error('API_KEY=sk-secret')
    const app = createTuiApp({
      runtime,
      cwd: '/tmp',
      provider: 'p',
      model: 'm',
      diagnostics: {
        tty: true,
        launchConfigured: false,
        argsConfigured: true,
        sessionRoot: '/tmp/sessions',
      },
    })
    await app.start()
    app.dispatch({ type: 'command', line: '/doctor' })
    const message = app.snapshot().notice?.message ?? ''
    expect(message).toMatch(/tty yes/)
    expect(message).toMatch(/launch unset/)
    expect(message).toMatch(/initialize error/)
    expect(message).not.toMatch(/sk-|API_KEY=|ck_live_/)
  })

  it('/status mentions auth mode and never prints a key', async () => {
    const runtime = fakeRuntime()
    const app = createTuiApp({
      runtime,
      cwd: '/tmp',
      provider: 'deepseek-official',
      model: 'deepseek-v4-flash',
      sessionId: 's1',
      auth: {
        mode: 'byok',
        envLocked: true,
        accountLabel: 'Ada',
        logout: async () => {},
      },
    })
    await app.start()
    app.dispatch({ type: 'command', line: '/status' })
    const message = app.snapshot().notice?.message ?? ''
    expect(message).toMatch(/auth: byok/)
    expect(message).toMatch(/env-locked/)
    expect(message).toMatch(/account: Ada/)
    expect(message).not.toMatch(/sk-|ck_live_|API_KEY=/)
  })

  it('/use byok restarts the runtime as a new session', async () => {
    const runtime = fakeRuntime()
    const app = createTuiApp({
      runtime,
      cwd: '/tmp',
      provider: 'cocode-cloud',
      model: 'cloud-1',
      sessionId: 's1',
      auth: {
        mode: 'cocode',
        envLocked: false,
        logout: async () => {},
        selectMode: async () => ({ status: 'ready' }),
        resolved: () => ({
          mode: 'byok',
          provider: 'deepseek-official',
          model: 'deepseek-v4-flash',
          cwd: '/tmp',
          origin: 'https://cocode.agency',
          home: '/tmp/home',
          env: { DEEPSEEK_API_KEY: 'sk-x', DSH_HOME: '/tmp/home' },
        }),
      },
    })
    await app.start()
    runtime.emit({
      method: 'session.event',
      params: {
        sessionId: 's1',
        event: {
          type: 'assistant/message',
          seq: 1,
          time: 1,
          data: {
            turn: 1,
            step: 1,
            message: { content: [{ type: 'text', text: 'old' }] },
          },
        },
      },
    })
    expect(app.snapshot().nodes.length).toBeGreaterThan(0)
    app.dispatch({ type: 'command', line: '/use byok' })
    await expect.poll(() => app.snapshot().header.provider).toBe('deepseek-official')
    expect(runtime.restarts).toEqual([
      { provider: 'deepseek-official', model: 'deepseek-v4-flash' },
    ])
    expect(app.snapshot().header.sessionId).not.toBe('s1')
    expect(app.snapshot().nodes).toEqual([])
    expect(app.snapshot().notice?.message).toMatch(/API Key/)
    expect(app.snapshot().notice?.message).toMatch(/新会话/)
    expect(app.snapshot().notice?.message).not.toMatch(/sk-|ck_/)
    expect(app.snapshot().agent).toBe('idle')
  })

  it('/use byok without a key captures a masked paste', async () => {
    const runtime = fakeRuntime()
    const keys: string[] = []
    let modeCalls = 0
    const app = createTuiApp({
      runtime,
      cwd: '/tmp',
      provider: 'cocode-cloud',
      model: 'cloud-1',
      sessionId: 's1',
      auth: {
        mode: 'cocode',
        envLocked: false,
        logout: async () => {},
        selectMode: async () => {
          modeCalls += 1
          return modeCalls === 1 ? { status: 'need-byok' } : { status: 'ready' }
        },
        submitByok: async (key) => {
          keys.push(key)
        },
        resolved: () => ({
          mode: 'byok',
          provider: 'deepseek-official',
          model: 'deepseek-v4-flash',
          cwd: '/tmp',
          origin: 'https://cocode.agency',
          home: '/tmp/home',
          env: { DEEPSEEK_API_KEY: 'sk-new', DSH_HOME: '/tmp/home' },
        }),
      },
    })
    await app.start()
    app.dispatch({ type: 'command', line: '/use byok' })
    await expect.poll(() => app.snapshot().composer.mask).toBe(true)
    app.dispatch({ type: 'submit', text: '   ' })
    expect(app.snapshot().composer.mask).toBe(true)
    expect(runtime.restarts).toEqual([])
    app.dispatch({ type: 'submit', text: 'sk-new' })
    await expect.poll(() => app.snapshot().header.provider).toBe('deepseek-official')
    expect(keys).toEqual(['sk-new'])
    expect(app.snapshot().composer.mask).toBeUndefined()
    expect(app.snapshot().exiting).toBe(false)
  })

  it('/logout keeps the TUI when BYOK remains', async () => {
    const runtime = fakeRuntime()
    const app = createTuiApp({
      runtime,
      cwd: '/tmp',
      provider: 'cocode-cloud',
      model: 'cloud-1',
      sessionId: 's1',
      auth: {
        mode: 'cocode',
        envLocked: false,
        logout: async () => {},
        snapshot: () => ({
          phase: 'ready',
          mode: 'byok',
          envLocked: false,
          channels: { byok: true, cocode: false },
        }),
        resolved: () => ({
          mode: 'byok',
          provider: 'deepseek-official',
          model: 'deepseek-v4-flash',
          cwd: '/tmp',
          origin: 'https://cocode.agency',
          home: '/tmp/home',
          env: { DEEPSEEK_API_KEY: 'sk-x', DSH_HOME: '/tmp/home' },
        }),
      },
    })
    await app.start()
    app.dispatch({ type: 'command', line: '/logout' })
    await expect.poll(() => app.snapshot().header.provider).toBe('deepseek-official')
    expect(app.snapshot().exiting).toBe(false)
    expect(app.snapshot().header.sessionId).not.toBe('s1')
  })

  it('refuses /use while a turn is running', async () => {
    const runtime = fakeRuntime()
    const app = createTuiApp({
      runtime,
      cwd: '/tmp',
      provider: 'p',
      model: 'm',
      sessionId: 's1',
      auth: {
        mode: 'byok',
        envLocked: false,
        logout: async () => {},
        selectMode: async () => ({ status: 'ready' }),
      },
    })
    await app.start()
    runtime.emit({
      method: 'session.status',
      params: { sessionId: 's1', status: 'running' },
    })
    app.dispatch({ type: 'command', line: '/use cocode' })
    expect(runtime.restarts).toEqual([])
    expect(app.snapshot().notice?.message).toMatch(/Turn in progress|先等|Esc/)
  })

  it('refuses /use when another TUI shares the home', async () => {
    const runtime = fakeRuntime()
    const app = createTuiApp({
      runtime,
      cwd: '/tmp',
      provider: 'cocode-cloud',
      model: 'cloud-1',
      sessionId: 's1',
      auth: {
        mode: 'cocode',
        envLocked: false,
        logout: async () => {},
        exclusiveHome: async () => false,
        selectMode: async () => ({ status: 'ready' }),
        resolved: () => ({
          mode: 'byok',
          provider: 'deepseek-official',
          model: 'deepseek-v4-flash',
          cwd: '/tmp',
          origin: 'https://cocode.agency',
          home: '/tmp/home',
          env: { DEEPSEEK_API_KEY: 'sk-x', DSH_HOME: '/tmp/home' },
        }),
      },
    })
    await app.start()
    app.dispatch({ type: 'command', line: '/use byok' })
    await expect.poll(() => app.snapshot().notice?.message ?? '').toMatch(/AUTH_HOME_BUSY/)
    expect(runtime.restarts).toEqual([])
    expect(app.snapshot().header.provider).toBe('cocode-cloud')
    expect(app.snapshot().header.sessionId).toBe('s1')
  })

  it('refuses /logout when another TUI shares the home', async () => {
    const runtime = fakeRuntime()
    let loggedOut = false
    const app = createTuiApp({
      runtime,
      cwd: '/tmp',
      provider: 'cocode-cloud',
      model: 'cloud-1',
      sessionId: 's1',
      auth: {
        mode: 'cocode',
        envLocked: false,
        exclusiveHome: async () => false,
        logout: async () => {
          loggedOut = true
        },
        snapshot: () => ({
          phase: 'ready',
          mode: 'byok',
          envLocked: false,
          channels: { byok: true, cocode: false },
        }),
        resolved: () => ({
          mode: 'byok',
          provider: 'deepseek-official',
          model: 'deepseek-v4-flash',
          cwd: '/tmp',
          origin: 'https://cocode.agency',
          home: '/tmp/home',
          env: { DEEPSEEK_API_KEY: 'sk-x', DSH_HOME: '/tmp/home' },
        }),
      },
    })
    await app.start()
    app.dispatch({ type: 'command', line: '/logout' })
    await expect.poll(() => app.snapshot().notice?.message ?? '').toMatch(/AUTH_HOME_BUSY/)
    expect(loggedOut).toBe(false)
    expect(app.snapshot().exiting).toBe(false)
    expect(runtime.restarts).toEqual([])
  })
})
