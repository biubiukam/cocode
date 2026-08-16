import test from 'node:test'
import assert from 'node:assert/strict'
import { TuiCompanionGateway } from '../lib/host-jsonrpc-plugin.js'

function createContext(options = {}) {
  const followed = []
  let activeAgent
  const ctx = {
    agents: {
      get(id) {
        return activeAgent?.id === id ? activeAgent : undefined
      },
      async create(agentOptions) {
        activeAgent = {
          id: 'agent-1',
          options: agentOptions,
          session: {
            id: agentOptions.sessionId,
            events: [],
            header: { id: agentOptions.sessionId, createdAt: 1 },
          },
          status: 'idle',
          followup(message) {
            followed.push(message)
          },
          steer() {},
          cancel() {},
          async whenIdle() {},
        }
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
      return undefined
    },
    on() {
      return () => undefined
    },
  }
  return { ctx, followed }
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
