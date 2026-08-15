import { PassThrough } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { TuiCompanionGateway } from '../../packages/companion/src/gateway.ts'
import { CompanionTransport } from '../../packages/companion/src/transport.ts'
import type {
  Agent,
  AgentHandle,
  RuntimeContext,
  SessionEvent,
} from '../../packages/companion/src/types.ts'

type TestAgent = Agent & { calls: { kind: 'followup' | 'steer'; message: unknown }[] }

function createHarnessContext(
  options: {
    services?: Record<string, unknown>
    events?: Map<string, (...args: never[]) => unknown>
  } = {},
): {
  context: RuntimeContext
  agents: Map<string, TestAgent>
  events: Map<string, (...args: never[]) => unknown>
} {
  const agents = new Map<string, TestAgent>()
  const events = options.events ?? new Map<string, (...args: never[]) => unknown>()
  const context = {
    agents: {
      get(id: string) {
        return agents.get(id)
      },
      async create(createOptions: Record<string, unknown>): Promise<AgentHandle> {
        const sessionId = String(createOptions.sessionId)
        const calls: TestAgent['calls'] = []
        const session = {
          id: sessionId,
          events: (createOptions.seed as SessionEvent[] | undefined) ?? [],
          header: {
            id: sessionId,
            createdAt: 1,
            ...(typeof createOptions.meta === 'object' && createOptions.meta !== null
              ? createOptions.meta
              : {}),
          },
        }
        const agent: TestAgent = {
          id: sessionId,
          options: {},
          session,
          status: 'idle',
          calls,
          followup(message) {
            calls.push({ kind: 'followup', message })
            agent.status = 'running'
          },
          steer(message) {
            calls.push({ kind: 'steer', message })
          },
          cancel() {
            agent.status = 'idle'
          },
          async whenIdle() {},
        }
        agents.set(sessionId, agent)
        return {
          agent,
          async dispose() {
            agents.delete(sessionId)
          },
        }
      },
      async resume(createOptions: Record<string, unknown>): Promise<AgentHandle> {
        return context.agents.create({ sessionId: createOptions.resumeSessionId, seed: [] })
      },
    },
    sessions: {
      forkSeed(session, boundary) {
        return boundary === undefined
          ? [...session.events]
          : session.events.filter((event) => event.seq <= boundary)
      },
    },
    root: { fiber: { async dispose() {} } },
    get<T = unknown>(name: string): T | undefined {
      return options.services?.[name] as T | undefined
    },
    on(event: string, handler: (...args: never[]) => unknown) {
      events.set(event, handler)
      return () => {
        if (events.get(event) === handler) events.delete(event)
      }
    },
  } as RuntimeContext
  return { context, agents, events }
}

function createGateway(options: Parameters<typeof createHarnessContext>[0] = {}) {
  const input = new PassThrough()
  const output = new PassThrough()
  const transport = new CompanionTransport(input, output)
  const harness = createHarnessContext(options)
  const gateway = new TuiCompanionGateway(harness.context, transport)
  return { ...harness, gateway, output, transport }
}

describe('TuiCompanionGateway', () => {
  it('advertises only services present in the composition', () => {
    const { gateway } = createGateway({ services: { skills: {}, approval: {} } })
    expect(gateway.capabilities()).toEqual({
      protocolVersion: 1,
      promptModes: ['normal', 'queue', 'steer'],
      skills: true,
      approval: true,
      permissionMode: false,
      planMode: false,
      sessionList: false,
      interactions: 'notification-response',
      checkpoint: false,
    })
  })

  it('routes normal, queue, and steer prompts to the agent', async () => {
    const { gateway, agents } = createGateway()
    await gateway.initialize({ cwd: '/tmp/project', provider: 'provider', model: 'model' })
    await gateway.prompt({ sessionId: 'session-a', contentBlocks: [{ type: 'text', text: 'one' }] })
    await gateway.prompt({
      sessionId: 'session-a',
      contentBlocks: [{ type: 'text', text: 'two' }],
      mode: 'queue',
    })
    await gateway.prompt({
      sessionId: 'session-a',
      contentBlocks: [{ type: 'text', text: 'three' }],
      mode: 'steer',
    })

    const calls = agents.get('session-a')?.calls
    expect(calls?.map((call) => call.kind)).toEqual(['followup', 'followup', 'steer'])
  })

  it('rejects an unavailable optional service with an explicit error', async () => {
    const { gateway } = createGateway()
    await gateway.initialize({ cwd: '/tmp/project', provider: 'provider', model: 'model' })
    await expect(gateway.listSkills({ sessionId: 'session-a' })).rejects.toThrow(
      'skills registry is not configured',
    )
  })

  it('enables plan mode before the first prompt without creating a session on read', async () => {
    const activeSessions = new Set<string>()
    const { gateway, agents } = createGateway({
      services: {
        planMode: {
          get(agent: Agent) {
            return { active: activeSessions.has(String(agent.session.id)) }
          },
          set(agent: Agent, active: boolean) {
            const sessionId = String(agent.session.id)
            if (active) activeSessions.add(sessionId)
            else activeSessions.delete(sessionId)
          },
        },
      },
    })
    await gateway.initialize({ cwd: '/tmp/project', provider: 'provider', model: 'model' })

    await expect(gateway.planMode({ sessionId: 'session-a' })).resolves.toEqual({ active: false })
    expect(agents.has('session-a')).toBe(false)
    await expect(
      gateway.planMode({ sessionId: 'session-a', active: true }),
    ).resolves.toEqual({ active: true })
    expect(agents.has('session-a')).toBe(true)

    const enabling = gateway.planMode({ sessionId: 'session-b', active: true })
    const reading = gateway.planMode({ sessionId: 'session-b' })
    await expect(Promise.all([enabling, reading])).resolves.toEqual([
      { active: true },
      { active: true },
    ])
  })

  it('supports permission mode before the first prompt', async () => {
    let currentMode = 'manual'
    const { gateway, agents } = createGateway({
      services: {
        permissionPresets: {
          names: ['manual', 'allow-all'],
          current: () => currentMode,
          set: (_session, mode: string) => {
            currentMode = mode
          },
        },
      },
    })
    await gateway.initialize({ cwd: '/tmp/project', provider: 'provider', model: 'model' })

    await expect(gateway.permissionMode({ sessionId: 'session-a' })).resolves.toEqual({
      mode: 'manual',
      supportedModes: ['manual', 'allow-all'],
    })
    expect(agents.has('session-a')).toBe(false)
    await expect(
      gateway.permissionMode({ sessionId: 'session-a', mode: 'allow-all' }),
    ).resolves.toEqual({ mode: 'allow-all', supportedModes: ['manual', 'allow-all'] })
    expect(agents.has('session-a')).toBe(true)

    const changing = gateway.permissionMode({ sessionId: 'session-b', mode: 'allow-all' })
    const reading = gateway.permissionMode({ sessionId: 'session-b' })
    await expect(Promise.all([changing, reading])).resolves.toEqual([
      { mode: 'allow-all', supportedModes: ['manual', 'allow-all'] },
      { mode: 'allow-all', supportedModes: ['manual', 'allow-all'] },
    ])
  })

  it('waits for an opening session before changing plan mode', async () => {
    let releaseInspection!: () => void
    const inspection = new Promise<void>((resolve) => {
      releaseInspection = resolve
    })
    const activeAgents = new Set<Agent>()
    const { gateway } = createGateway({
      services: {
        sessionPersistence: {
          async list() {
            return []
          },
          async inspect() {
            await inspection
            return { meta: { id: 'session-a', cwd: '/tmp/project' }, events: [] }
          },
        },
        planMode: {
          get(agent: Agent) {
            return { active: activeAgents.has(agent) }
          },
          set(agent: Agent, active: boolean) {
            if (active) activeAgents.add(agent)
            else activeAgents.delete(agent)
          },
        },
      },
    })
    await gateway.initialize({ cwd: '/tmp/project', provider: 'provider', model: 'model' })

    const opening = gateway.open({ sessionId: 'session-a' })
    await new Promise<void>((resolve) => setImmediate(resolve))
    const changing = gateway.planMode({ sessionId: 'session-a', active: true })
    releaseInspection()
    await Promise.all([opening, changing])

    await expect(gateway.planMode({ sessionId: 'session-a' })).resolves.toEqual({ active: true })
  })

  it('round-trips an approval response through notification and request', async () => {
    const { gateway, events, output } = createGateway({ services: { approval: {} } })
    await gateway.initialize({ cwd: '/tmp/project', provider: 'provider', model: 'model' })
    const promptResult = await gateway.prompt({
      sessionId: 'session-a',
      contentBlocks: [{ type: 'text', text: 'start' }],
    })
    expect(promptResult.messageId).toMatch(/^[0-9a-f-]+$/)

    const approval = events.get('approval/request')
    expect(approval).toBeDefined()
    const pending = approval?.(
      {
        agent: {
          session: {
            id: 'session-a',
            events: [{ type: 'turn/start', seq: 1, time: 1, data: {} }],
          },
        } as Agent,
        toolName: 'write_file',
        reason: 'change file',
      },
      async () => 'unavailable',
    )
    const frame = JSON.parse(output.read()?.toString('utf8') ?? '{}') as {
      params?: { requestId?: string }
    }
    await gateway.respondApproval({ requestId: frame.params?.requestId, outcome: 'rejected' })
    await expect(pending).resolves.toBe('rejected')
  })
})
