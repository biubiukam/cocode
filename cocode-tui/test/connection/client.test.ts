import { describe, expect, it } from 'vitest'
import { probeRuntimeCapabilities } from '../../packages/connection/src/capability.ts'
import { createTuiRuntime } from '../../packages/connection/src/client.ts'

type ProbeCall = { method: string; params: object; timeoutMs?: number }

describe('runtime capability negotiation', () => {
  it('exposes a conservative snapshot before a runtime handshake', () => {
    const runtime = createTuiRuntime({ command: 'node', args: ['unused-runtime.js'] })

    expect(runtime.getCapabilities?.()).toEqual({
      source: 'fallback',
      capabilities: {
        cancel: false,
        open: false,
        fork: false,
        rewind: false,
        skills: false,
        onRequest: false,
        approval: false,
        permissionMode: false,
        planMode: false,
        sessionList: false,
        promptMode: false,
      },
      errors: { onRequest: 'runtime capability probe has not run' },
    })
  })

  it('recognizes routed methods even when the probe uses an unknown session', async () => {
    const calls: ProbeCall[] = []
    const snapshot = await probeRuntimeCapabilities(
      {
        async request(method, params, timeoutMs) {
          calls.push({ method, params: params ?? {}, timeoutMs })
          throw new Error(`${method} rejected the probe session`)
        },
      },
      { onRequest: true, probeSessionId: 'probe-session' },
    )

    expect(snapshot).toEqual({
      source: 'runtime',
      capabilities: {
        cancel: true,
        open: true,
        fork: true,
        rewind: true,
        skills: true,
        onRequest: true,
        approval: false,
        permissionMode: true,
        planMode: true,
        sessionList: true,
        promptMode: false,
      },
      errors: {},
    })
    expect(calls).toHaveLength(8)
    expect(calls.every((call) => call.timeoutMs === 1_000)).toBe(true)
    expect(calls[0]?.params).toEqual({ sessionId: 'probe-session', keepInbox: true })
    expect(calls[3]?.params).toEqual({
      sourceSessionId: 'probe-session',
      rewindToMessageSeq: 1,
    })
  })

  it('reports unknown protocol methods without enabling the corresponding capability', async () => {
    const snapshot = await probeRuntimeCapabilities(
      {
        async request(method) {
          throw new Error(`unknown DeepSeek Harness SDK runtime method: ${method}`)
        },
      },
      { onRequest: false, probeSessionId: 'probe-session' },
    )

    expect(snapshot.capabilities).toEqual({
      cancel: false,
      open: false,
      fork: false,
      rewind: false,
      skills: false,
      onRequest: false,
      approval: false,
      permissionMode: false,
      planMode: false,
      sessionList: false,
      promptMode: false,
    })
    expect(snapshot.errors).toEqual({
      cancel: 'protocol method is not supported by the runtime',
      open: 'protocol method is not supported by the runtime',
      fork: 'protocol method is not supported by the runtime',
      rewind: 'protocol method is not supported by the runtime',
      skills: 'protocol method is not supported by the runtime',
      sessionList: 'protocol method is not supported by the runtime',
      permissionMode: 'protocol method is not supported by the runtime',
      planMode: 'protocol method is not supported by the runtime',
      onRequest: 'SDK client does not expose onRequest',
    })
  })

  it('keeps skills disabled when the runtime has no skill registry', async () => {
    const snapshot = await probeRuntimeCapabilities(
      {
        async request(method) {
          if (method === 'skills/list') throw new Error('skills registry is not configured')
          throw new Error('session does not exist')
        },
      },
      { onRequest: true, probeSessionId: 'probe-session' },
    )

    expect(snapshot.capabilities).toMatchObject({
      cancel: true,
      open: true,
      fork: true,
      rewind: true,
      skills: false,
      onRequest: true,
    })
    expect(snapshot.errors.skills).toBe('skills registry is not configured')
  })

  it('does not treat malformed successful responses as support', async () => {
    const snapshot = await probeRuntimeCapabilities(
      {
        async request(method) {
          if (method === 'session/cancel') return {}
          if (method === 'session/open') return { opened: true }
          if (method === 'session/fork') return { sessionId: 'child', seedLength: 1, seed: [42] }
          return { skills: [] }
        },
      },
      { onRequest: true, probeSessionId: 'probe-session' },
    )

    expect(snapshot.capabilities).toMatchObject({
      cancel: false,
      open: true,
      fork: false,
      rewind: false,
      skills: true,
      onRequest: true,
    })
    expect(snapshot.errors.cancel).toContain('invalid capability probe result')
    expect(snapshot.errors.fork).toContain('invalid capability probe result')
    expect(snapshot.errors.rewind).toContain('invalid capability probe result')
  })

  it('treats a bounded probe timeout as unavailable', async () => {
    const timeout = Object.assign(new Error('probe timed out'), { name: 'RequestTimeoutError' })
    const snapshot = await probeRuntimeCapabilities(
      {
        async request() {
          throw timeout
        },
      },
      { onRequest: true, probeSessionId: 'probe-session' },
    )

    expect(snapshot.capabilities.cancel).toBe(false)
    expect(snapshot.errors.cancel).toBe('probe timed out')
  })

  it('does not infer rewind support when the fork endpoint rejects rewind parameters', async () => {
    const snapshot = await probeRuntimeCapabilities(
      {
        async request(method, params) {
          if (method === 'session/fork' && 'rewindToMessageSeq' in (params ?? {})) {
            throw new Error('unknown parameter rewindToMessageSeq')
          }
          throw new Error('unknown SDK session')
        },
      },
      { onRequest: true, probeSessionId: 'probe-session' },
    )

    expect(snapshot.capabilities.fork).toBe(true)
    expect(snapshot.capabilities.rewind).toBe(false)
    expect(snapshot.errors.rewind).toContain('capability-specific parameters')
  })
})
