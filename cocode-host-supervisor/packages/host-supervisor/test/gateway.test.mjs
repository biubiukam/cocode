import test from 'node:test'
import assert from 'node:assert/strict'
import { realpath } from 'node:fs/promises'
import { TuiCompanionGateway } from '../lib/host-jsonrpc-plugin.js'

function createContext(options = {}) {
  const followed = []
  const created = []
  let activeAgent
  const ctx = {
    agents: {
      get(id) {
        return activeAgent?.id === id ? activeAgent : undefined
      },
      async create(agentOptions) {
        if (typeof agentOptions.setup === 'function') {
          await agentOptions.setup({ agent: { id: 'agent-1' } })
        }
        activeAgent = {
          id: 'agent-1',
          options: agentOptions,
          session: {
            id: agentOptions.sessionId,
            events: [],
            header: {
              id: agentOptions.sessionId,
              createdAt: 1,
              cwd: agentOptions.meta?.cwd,
              ...(typeof agentOptions.meta?.agentPreset === 'string'
                ? { agentPreset: agentOptions.meta.agentPreset }
                : {}),
            },
          },
          status: 'idle',
          followup(message) {
            followed.push(message)
          },
          steer() {},
          cancel() {},
          async whenIdle() {},
        }
        created.push(activeAgent)
        return { agent: activeAgent, async dispose() {} }
      },
      async resume() {
        throw new Error('resume is not used by this test')
      },
    },
    sessions: {
      forkSeed() {
        return []
      },
    },
    root: { fiber: { async dispose() {} } },
    get(name) {
      if (name === 'llm') {
        return {
          listProviders() {
            return [{ id: 'deepseek-official', name: 'DeepSeek' }]
          },
          async listModels() {
            return options.listed === false ? [] : [{
              id: 'deepseek-v4-flash',
              name: 'DeepSeek V4 Flash',
              inputModalities: options.inputModalities ?? ['text'],
            }]
          },
          async resolveModelInfo(_provider, model) {
            return {
              id: model,
              inputModalities: options.resolvedInputModalities ?? options.inputModalities ?? ['text'],
            }
          },
        }
      }
      if (name === 'cocodeVision') return options.vision
      if (name === 'skills') return options.skills
      if (name === 'agentPresets') return options.agentPresets
      if (name === 'loader') {
        return options.loader ?? {
          entries() {
            return []
          },
        }
      }
      if (name === 'workspaceRegistry') return options.workspaceRegistry
      return undefined
    },
    on() {
      return () => undefined
    },
  }
  return { ctx, followed, created }
}

function createGateway(ctx) {
  return new TuiCompanionGateway(ctx, { notify() {} }, { registerQuestionProvider: false })
}

async function initialize(gateway) {
  await gateway.initialize({
    cwd: '/tmp',
    provider: 'deepseek-official',
    model: 'deepseek-v4-flash',
  })
}

const imageBlock = {
  type: 'image',
  attachment: {
    attachmentId: 'image-1',
    mediaType: 'image/png',
    bytes: 3,
    width: 1,
    height: 1,
  },
}

test('rejects unsupported images before they enter the session', async () => {
  const { ctx, followed } = createContext()
  const gateway = createGateway(ctx)
  await initialize(gateway)

  await assert.rejects(
    gateway.prompt({ sessionId: 's1', contentBlocks: [imageBlock] }),
    /does not support image content/i,
  )
  assert.equal(followed.length, 0)
})

test('asks for workspace authorization before creating a session', async () => {
  let createdWorkspaces = 0
  const { ctx, created } = createContext({
    workspaceRegistry: {
      async resolveByPath() {
        return undefined
      },
      async create() {
        createdWorkspaces += 1
        throw new Error('workspace should not be created before approval')
      },
    },
  })
  const gateway = createGateway(ctx)
  await initialize(gateway)

  await assert.deepEqual(
    await gateway.handleRequest('cocode/workspace/ensure', { sessionId: 's1' }),
    {
      status: 'authorization-required',
      path: await realpath('/tmp'),
      title: 'tmp',
    },
  )
  assert.equal(created.length, 0)
  assert.equal(createdWorkspaces, 0)
})

test('creates and attaches a workspace only after approval', async () => {
  const attached = []
  const workspace = {
    id: 'workspace-1',
    path: '/tmp',
    title: 'tmp',
    async attachSession(sessionId) {
      attached.push(sessionId)
    },
  }
  let createdWorkspaces = 0
  const { ctx, created } = createContext({
    workspaceRegistry: {
      async resolveByPath() {
        return undefined
      },
      async create() {
        createdWorkspaces += 1
        return workspace
      },
    },
  })
  const gateway = createGateway(ctx)
  await initialize(gateway)

  assert.deepEqual(
    await gateway.ensureWorkspace({ sessionId: 's1', approved: true }),
    {
      status: 'ready',
      workspaceId: 'workspace-1',
      path: '/tmp',
      title: 'tmp',
      created: true,
    },
  )
  assert.equal(created.length, 1)
  assert.equal(createdWorkspaces, 1)
  assert.deepEqual(attached, ['s1'])
})

test('reuses an existing workspace without asking for authorization', async () => {
  const attached = []
  const workspace = {
    id: 'workspace-1',
    path: '/tmp',
    title: 'tmp',
    async attachSession(sessionId) {
      attached.push(sessionId)
    },
  }
  let createdWorkspaces = 0
  const { ctx, created } = createContext({
    workspaceRegistry: {
      async resolveByPath() {
        return workspace
      },
      async create() {
        createdWorkspaces += 1
        return workspace
      },
    },
  })
  const gateway = createGateway(ctx)
  await initialize(gateway)

  assert.deepEqual(
    await gateway.ensureWorkspace({ sessionId: 's1' }),
    {
      status: 'ready',
      workspaceId: 'workspace-1',
      path: '/tmp',
      title: 'tmp',
      created: false,
    },
  )
  assert.equal(created.length, 1)
  assert.equal(createdWorkspaces, 0)
  assert.deepEqual(attached, ['s1'])
})

test('uses vision evidence without retaining images for text-only models', async () => {
  const visionCalls = []
  const { ctx, followed } = createContext({
    vision: {
      async prepareBlocks(blocks, options) {
        visionCalls.push({ blocks, options })
        return [{ type: 'text', text: '[Image evidence]\na diagram' }]
      },
    },
  })
  const gateway = createGateway(ctx)
  await initialize(gateway)

  await gateway.prompt({
    sessionId: 's1',
    contentBlocks: [{ type: 'text', text: 'Read this image' }, imageBlock],
  })

  assert.deepEqual(visionCalls[0]?.options, { preserveImages: false })
  assert.deepEqual(followed[0]?.content, [{ type: 'text', text: '[Image evidence]\na diagram' }])
  assert.deepEqual(followed[0]?.source, {
    kind: 'user',
    displayContent: [{ type: 'text', text: 'Read this image' }, imageBlock],
  })
})

test('rejects an unconfigured vision bridge before persisting the image', async () => {
  const { ctx, followed } = createContext({
    vision: {
      async prepareBlocks(blocks) {
        return [...blocks]
      },
    },
  })
  const gateway = createGateway(ctx)
  await initialize(gateway)

  await assert.rejects(
    gateway.prompt({ sessionId: 's1', contentBlocks: [imageBlock] }),
    /vision bridge is not configured/i,
  )
  assert.equal(followed.length, 0)
})

test('passes images directly to models that declare native image input', async () => {
  const { ctx, followed } = createContext({ inputModalities: ['text', 'image'] })
  const gateway = createGateway(ctx)
  await initialize(gateway)

  await gateway.prompt({ sessionId: 's1', contentBlocks: [imageBlock] })

  assert.deepEqual(followed[0]?.content, [imageBlock])
})

test('mounts the default agent preset before creating a TUI session', async () => {
  const mounted = []
  const { ctx, followed } = createContext({
    agentPresets: {
      async resolve(id) {
        return { id: id ?? 'standard' }
      },
      async mount(_agentCtx, id) {
        mounted.push(id)
        return { id: id ?? 'standard' }
      },
    },
  })
  const gateway = createGateway(ctx)
  await initialize(gateway)

  await gateway.prompt({ sessionId: 's1', contentBlocks: [{ type: 'text', text: 'hello' }] })

  assert.deepEqual(mounted, ['standard'])
  assert.equal(followed.length, 1)
})

test('restores the latest preset selected in a persisted session log', async () => {
  const mounted = []
  const { ctx } = createContext({
    agentPresets: {
      async resolve(id) {
        return { id: id ?? 'standard' }
      },
      async mount(_agentCtx, id) {
        mounted.push(id)
      },
    },
  })
  const originalGet = ctx.get.bind(ctx)
  ctx.get = name => name === 'sessionPersistence'
    ? {
        async inspect() {
          return {
            meta: { id: 'persisted', createdAt: 1, cwd: '/tmp', agentPreset: 'standard' },
            events: [{
              type: 'agent-preset/selected',
              seq: 1,
              time: 1,
              data: { agentPreset: 'minimal' },
            }],
          }
        },
      }
    : originalGet(name)
  ctx.agents.resume = async agentOptions => ctx.agents.create({
    sessionId: 'persisted',
    meta: { cwd: '/tmp' },
    setup: agentOptions.setup,
  })
  const gateway = createGateway(ctx)
  await initialize(gateway)

  await gateway.open({ sessionId: 'persisted' })

  assert.deepEqual(mounted, ['minimal'])
})

test('inherits the source session preset when forking a TUI session', async () => {
  const mounted = []
  const { ctx, created } = createContext({
    agentPresets: {
      async resolve(id) {
        return { id: id ?? 'standard' }
      },
      async mount(_agentCtx, id) {
        mounted.push(id)
      },
    },
  })
  const gateway = createGateway(ctx)
  await initialize(gateway)

  await gateway.prompt({ sessionId: 'source', contentBlocks: [{ type: 'text', text: 'hello' }] })
  created[0].session.events.push({
    type: 'agent-preset/selected',
    seq: 1,
    time: 1,
    data: { agentPreset: 'minimal' },
  })

  await gateway.fork({ sourceSessionId: 'source', childSessionId: 'child' })

  assert.deepEqual(mounted, ['standard', 'minimal'])
  assert.equal(created[1].options.meta.agentPreset, 'minimal')
})

test('uses exact model capabilities when a native vision model is not listed', async () => {
  const { ctx, followed } = createContext({
    listed: false,
    resolvedInputModalities: ['text', 'image'],
  })
  const gateway = createGateway(ctx)
  await initialize(gateway)

  await gateway.prompt({ sessionId: 's1', contentBlocks: [imageBlock] })

  assert.deepEqual(followed[0]?.content, [imageBlock])
})

test('lists skills from the current agent scope', async () => {
  const lookups = []
  const { ctx } = createContext({
    skills: {
      async list(lookup) {
        lookups.push(lookup)
        if (lookup.scope === undefined) return []
        return [
          {
            name: 'code-review',
            description: 'Review the current change',
            source: 'user-agents',
            invocation: { userInvocable: true },
          },
        ]
      },
    },
  })
  const gateway = createGateway(ctx)
  await initialize(gateway)

  assert.deepEqual(await gateway.listSkills({ sessionId: 's1' }), {
    skills: [
      {
        name: 'code-review',
        description: 'Review the current change',
        source: 'user-agents',
      },
    ],
  })
  assert.equal(lookups.length, 1)
  assert.equal(lookups[0].cwd, '/tmp')
  assert.equal(lookups[0].scope.session.id, 's1')
})

test('lists non-group loader entries with enablement and fiber phase', async () => {
  const entries = [
    { id: 'active-plugin', options: { name: '@deepseek-ai/dsh-tools' }, fiber: { state: 2 } },
    { id: 'disabled-plugin', disabled: true, options: { name: '@deepseek-ai/dsh-web' }, fiber: { state: 4 } },
    { id: 'group', options: { name: 'group', group: true }, fiber: { state: 2 } },
  ]
  const { ctx } = createContext({
    loader: {
      * entries() {
        yield* entries
      },
    },
  })
  const gateway = createGateway(ctx)
  await initialize(gateway)

  assert.deepEqual(gateway.capabilities().plugins, true)
  assert.deepEqual(gateway.capabilities().pluginsMutate, true)
  assert.deepEqual(gateway.listPlugins(), {
    plugins: [
      {
        entryId: 'active-plugin',
        moduleName: '@deepseek-ai/dsh-tools',
        enabled: true,
        fiberPhase: 'active',
      },
      {
        entryId: 'disabled-plugin',
        moduleName: '@deepseek-ai/dsh-web',
        enabled: false,
        fiberPhase: null,
      },
    ],
  })

  entries[0].update = async ({ disabled }) => {
    entries[0].disabled = disabled
    entries[0].fiber = disabled ? { state: 4 } : { state: 2 }
  }
  assert.deepEqual(
    await gateway.setPluginEnabled({ entryId: 'active-plugin', enabled: false }),
    {
      entryId: 'active-plugin',
      moduleName: '@deepseek-ai/dsh-tools',
      enabled: false,
      fiberPhase: null,
    },
  )
})
