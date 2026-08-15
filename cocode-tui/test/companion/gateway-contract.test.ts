import { resolve } from 'node:path'
import { PassThrough } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { TuiCompanionGateway } from '../../packages/companion/src/gateway.ts'
import { CompanionTransport } from '../../packages/companion/src/transport.ts'
import type { Agent, AgentHandle, RuntimeContext, SessionEvent } from '../../packages/companion/src/types.ts'

type TestAgent = Agent & { calls: string[]; disposed: boolean }

const WORKSPACE_CWD = resolve('/workspace')
const OTHER_WORKSPACE_CWD = resolve('/other')

function createFixture() {
  const input = new PassThrough()
  const output = new PassThrough()
  const agents = new Map<string, TestAgent>()
  const events = new Map<string, (...args: never[]) => unknown>()
  let askQuestion:
    | ((request: {
        questions: { id: string; question: string }[]
      }) => Promise<{ answers: { id: string; selected: string[] }[] }>)
    | undefined
  let sessionNumber = 0
  const makeAgent = (id: string, seed: SessionEvent[] = []): AgentHandle => {
    const agent: TestAgent = {
      id,
      options: {},
      session: { id, events: seed, header: { id, createdAt: 10, cwd: WORKSPACE_CWD } },
      status: 'idle',
      calls: [],
      disposed: false,
      followup(message) {
        agent.calls.push(`followup:${message.content[0]?.text ?? ''}`)
        agent.status = 'running'
      },
      steer(message) {
        agent.calls.push(`steer:${message.content[0]?.text ?? ''}`)
        agent.status = 'running'
      },
      cancel() {
        agent.calls.push('cancel')
        agent.status = 'idle'
      },
      async whenIdle() {
        agent.status = 'idle'
      },
    }
    agents.set(id, agent)
    return {
      agent,
      async dispose() {
        agent.disposed = true
        agents.delete(id)
      },
    }
  }
  const persistence = {
    async list() {
      return [
        { id: 'old', createdAt: 1, cwd: WORKSPACE_CWD, seedLength: 2 },
        { id: 'other', createdAt: 2, cwd: OTHER_WORKSPACE_CWD },
      ]
    },
    async inspect(id: string) {
      return {
        meta: { id, createdAt: 1, cwd: WORKSPACE_CWD },
        events: [
          { type: 'session/title', seq: 1, time: 2, data: { title: 'Saved session' } },
          { type: 'user/message', seq: 2, time: 3, data: { content: [{ type: 'text', text: 'old' }] } },
        ],
      }
    },
  }
  const services = {
    llm: {
      listProviders() {
        return [
          { id: 'provider', name: 'Provider' },
          { id: 'p', name: 'P' },
        ]
      },
      async listModels(provider: string) {
        return provider === 'provider' ? [{ id: 'model', name: 'Model' }] : []
      },
    },
    skills: {
      async list() {
        return [
          { name: 'review', description: 'Review', invocation: { userInvocable: true } },
          { name: 'internal', description: 'Hidden', invocation: { userInvocable: false } },
        ]
      },
    },
    sessionPersistence: persistence,
    permissionPresets: {
      names: ['default', 'allow-all'],
      current: () => 'default',
      set: (_session: Agent['session'], _mode: string) => {},
    },
    planMode: {
      get: () => ({ active: false }),
      set: (_agent: Agent, active: boolean) => String(active),
    },
    userQuestions: {
      registerProvider(provider: { ask: typeof askQuestion }) {
        askQuestion = provider.ask
        return () => {
          askQuestion = undefined
        }
      },
    },
  }
  const context = {
    agents: {
      get: (id: string) => agents.get(id),
      async create(options: Record<string, unknown>) {
        const id = String(options.sessionId ?? `session-${++sessionNumber}`)
        return makeAgent(id, (options.seed as SessionEvent[] | undefined) ?? [])
      },
      async resume(options: Record<string, unknown>) {
        return makeAgent(String(options.resumeSessionId), [
          { type: 'session/title', seq: 1, time: 2, data: { title: 'Saved session' } },
          { type: 'user/message', seq: 2, time: 3, data: { content: [{ type: 'text', text: 'old' }] } },
        ])
      },
    },
    sessions: {
      forkSeed: (session: Agent['session'], boundary?: number) =>
        boundary === undefined ? [...session.events] : session.events.filter((event) => event.seq <= boundary),
    },
    root: { fiber: { async dispose() {} } },
    get<T = unknown>(name: string) {
      return services[name as keyof typeof services] as T | undefined
    },
    on(event: string, handler: (...args: never[]) => unknown) {
      events.set(event, handler)
      return () => events.delete(event)
    },
  } as RuntimeContext
  const transport = new CompanionTransport(input, output)
  const gateway = new TuiCompanionGateway(context, transport)
  return { gateway, agents, events, output, get askQuestion() { return askQuestion } }
}

async function readFrame(output: PassThrough): Promise<Record<string, unknown>> {
  await new Promise<void>((resolve) => setImmediate(resolve))
  return JSON.parse(output.read()?.toString('utf8') ?? '{}') as Record<string, unknown>
}

describe('TuiCompanionGateway RPC contract', () => {
  it('routes initialize, prompt, capabilities, list, mode, skills, and shutdown', async () => {
    const { gateway, agents } = createFixture()
    const initialized = await gateway.handleRequest('initialize', {
      cwd: WORKSPACE_CWD,
      provider: 'provider',
      model: 'model',
      maxTokens: 1024,
    })
    expect(initialized).toMatchObject({
      serverInfo: { name: 'cocode-tui-companion' },
      capabilities: {
        skills: true,
        permissionMode: true,
        planMode: true,
        sessionList: true,
        modelList: true,
      },
    })

    await gateway.handleRequest('session/prompt', {
      sessionId: 'live',
      contentBlocks: [{ type: 'text', text: 'hello' }],
      mode: 'steer',
    })
    expect(agents.get('live')?.calls).toEqual(['steer:hello'])
    expect(await gateway.handleRequest('session/cancel', { sessionId: 'live', keepInbox: true })).toEqual({
      cancelled: true,
    })
    expect(agents.get('live')?.calls).toEqual(['steer:hello', 'cancel'])
    expect(await gateway.handleRequest('cocode/capabilities')).toMatchObject({ protocolVersion: 1 })
    expect(await gateway.handleRequest('session/list', { cwd: WORKSPACE_CWD })).toMatchObject({
      sessions: [{ sessionId: 'old', title: 'Saved session', eventCount: 2 }],
    })
    expect(await gateway.handleRequest('skills/list', { sessionId: 'live' })).toEqual({
      skills: [{ name: 'review', description: 'Review' }],
    })
    const modelCatalog = {
      groups: [
        { id: 'provider', name: 'Provider', models: [{ id: 'model', name: 'Model' }] },
        { id: 'p', name: 'P', models: [] },
      ],
      failures: [],
    }
    expect(await gateway.handleRequest('cocode/model/list')).toEqual(modelCatalog)
    expect(await gateway.handleRequest('model/list')).toEqual(modelCatalog)
    expect(await gateway.handleRequest('permission/mode', { sessionId: 'live' })).toEqual({
      mode: 'default',
      supportedModes: ['default', 'allow-all'],
    })
    expect(await gateway.handleRequest('plan/mode', { sessionId: 'live', active: true })).toEqual({
      active: false,
    })

    await gateway.handleRequest('shutdown')
    expect(agents.get('live')).toBeUndefined()
    await expect(gateway.handleRequest('session/prompt', {
      sessionId: 'after-shutdown',
      contentBlocks: [{ type: 'text', text: 'nope' }],
    })).rejects.toThrow('shutting down')
  })

  it('opens and forks persisted sessions while replacing the current session', async () => {
    const { gateway, agents } = createFixture()
    await gateway.initialize({ cwd: WORKSPACE_CWD, provider: 'p', model: 'm' })
    await gateway.prompt({ sessionId: 'current', contentBlocks: [{ type: 'text', text: 'start' }] })
    const opened = await gateway.open({ sessionId: 'old', replaceSessionId: 'current' })
    expect(opened).toMatchObject({ opened: true, seedLength: 2 })
    expect(agents.get('current')).toBeUndefined()
    const forked = await gateway.fork({ sourceSessionId: 'old', childSessionId: 'child', replaceSessionId: 'old' })
    expect(forked).toMatchObject({ sessionId: 'child', seedLength: 2 })
    expect(agents.get('old')).toBeUndefined()
    expect(agents.get('child')).toBeDefined()
  })

  it('emits notification frames for runtime events', async () => {
    const { gateway, events, output } = createFixture()
    await gateway.initialize({ cwd: WORKSPACE_CWD, provider: 'p', model: 'm' })
    const agent = {
      session: {
        id: 'child',
        header: { id: 'child', createdAt: 1, parentSession: 'parent' },
        events: [],
      },
    } as Agent
    events.get('session/created')?.(agent.session)
    expect(await readFrame(output)).toMatchObject({ method: 'subagent.started' })
    events.get('session/event')?.(agent.session, { type: 'turn/start', seq: 1, time: 1, data: {} })
    expect(await readFrame(output)).toMatchObject({ method: 'session.event' })
    events.get('agent/status')?.({ agent, status: 'running' })
    expect(await readFrame(output)).toMatchObject({ method: 'session.status' })
  })

  it('round-trips the question request through the response RPC', async () => {
    const { gateway, output, askQuestion } = createFixture()
    await gateway.initialize({ cwd: WORKSPACE_CWD, provider: 'p', model: 'm' })
    expect(askQuestion).toBeDefined()
    const pending = askQuestion?.({
      questions: [{ id: 'mode', question: 'Mode?', options: [{ label: 'fast' }] }],
    })
    const request = await readFrame(output)
    const params = request.params as { requestId: string }
    await gateway.handleRequest('question/respond', {
      requestId: params.requestId,
      answer: { answers: [{ id: 'mode', selected: ['fast'] }] },
    })
    await expect(pending).resolves.toEqual({ answers: [{ id: 'mode', selected: ['fast'] }] })
  })

  it('propagates an explicit question cancellation without validating an empty answer batch', async () => {
    const { gateway, output, askQuestion } = createFixture()
    await gateway.initialize({ cwd: WORKSPACE_CWD, provider: 'p', model: 'm' })
    const pending = askQuestion?.({
      questions: [{ id: 'mode', question: 'Mode?', options: [{ label: 'fast' }] }],
    })
    const request = await readFrame(output)
    const params = request.params as { requestId: string }

    await gateway.handleRequest('question/respond', {
      requestId: params.requestId,
      cancelled: true,
    })

    await expect(pending).rejects.toThrow('ask_user_question was interrupted before the user answered')
  })
})
