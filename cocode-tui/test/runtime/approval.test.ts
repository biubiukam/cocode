import { describe, expect, it } from 'vitest'
import type { TuiApprovalRequest, TuiCapabilitySnapshot, TuiRuntime } from '@cocode/tui-connection'
import { createTuiApp } from '../../src/runtime/app.ts'

function approvalRuntime(): TuiRuntime & {
  request: (request: TuiApprovalRequest) => Promise<{ outcome: string }>
} {
  let approvalHandler: ((request: TuiApprovalRequest) => Promise<{ outcome: string }>) | undefined
  const snapshot: TuiCapabilitySnapshot = {
    source: 'runtime',
    capabilities: {
      cancel: false,
      open: false,
      fork: false,
      rewind: false,
      skills: false,
      onRequest: true,
      approval: true,
      permissionMode: false,
      planMode: false,
      sessionList: false,
      modelList: false,
      imageAttachments: false,
      commands: false,
      plugins: false,
      pluginsMutate: false,
      promptMode: false,
      queueMode: false,
    },
    errors: {},
  }
  const runtime = {
    async start() {
      return { name: 'test', version: '1', capabilities: undefined }
    },
    async restart() {
      return { name: 'test', version: '1', capabilities: undefined }
    },
    async prompt() {
      return 'message'
    },
    async cancel() {
      return false
    },
    async open() {
      return false
    },
    async fork() {
      return { sessionId: 'fork', seedLength: 0, seed: [] }
    },
    async rewind() {
      return { sessionId: 'rewind', seedLength: 0, seed: [] }
    },
    getCapabilities() {
      return snapshot
    },
    onApproval(handler: (request: TuiApprovalRequest) => Promise<{ outcome: string }>) {
      approvalHandler = handler
      return () => {
        approvalHandler = undefined
      }
    },
    subscribe() {
      return () => undefined
    },
    async close() {},
    request(request: TuiApprovalRequest) {
      if (approvalHandler === undefined) throw new Error('approval handler missing')
      return approvalHandler(request)
    },
  } as unknown as TuiRuntime & {
    request: (request: TuiApprovalRequest) => Promise<{ outcome: string }>
  }
  return runtime
}

describe('TuiApp approval flow', () => {
  it('notifies when an approval request needs attention', async () => {
    const runtime = approvalRuntime()
    const values: string[] = []
    const app = createTuiApp({
      runtime,
      cwd: '/tmp',
      provider: 'provider',
      model: 'model',
      sessionId: 'session',
      terminalNotify: {
        mode: 'osc777',
        platform: 'darwin',
        env: {},
        write: (value) => values.push(value),
      },
    })
    await app.start()

    const answer = runtime.request({
      sessionId: 'session',
      toolName: 'write_file',
      reason: 'modify source',
    })

    expect(values).toContain('\u001b]777;notify;Cocode;Approval required: write_file\u0007')
    app.dispatch({ type: 'approval.cancel' })
    await answer
  })

  it('keeps approval focus outside the composer and returns allow-for-turn', async () => {
    const runtime = approvalRuntime()
    const app = createTuiApp({
      runtime,
      cwd: '/tmp',
      provider: 'provider',
      model: 'model',
      sessionId: 'session',
    })
    await app.start()

    const answer = runtime.request({
      sessionId: 'session',
      toolName: 'write_file',
      reason: 'modify source',
    })
    expect(app.snapshot().approval?.request.toolName).toBe('write_file')
    app.dispatch({ type: 'approval.answer', outcome: 'allowed-for-turn' })
    await expect(answer).resolves.toEqual({ outcome: 'allowed-for-turn' })
    expect(app.snapshot().approval).toBeUndefined()
  })
})
