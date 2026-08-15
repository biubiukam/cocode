import { describe, expect, it } from 'vitest'
import type { TuiCapabilitySnapshot } from '@cocode/tui-connection'
import { P0_CAPABILITIES } from '../../src/runtime/capabilities.ts'
import {
  applyRuntimeCapabilities,
  refreshRuntimeCapabilities,
} from '../../src/runtime/capability-adapter.ts'

const snapshot: TuiCapabilitySnapshot = {
  source: 'runtime',
  capabilities: {
    cancel: true,
    open: false,
    fork: true,
    rewind: false,
    skills: true,
    onRequest: true,
    approval: true,
    permissionMode: true,
    planMode: false,
    sessionList: true,
    promptMode: true,
  },
  errors: {},
}

describe('capability adapter', () => {
  it('projects live wire capabilities without changing unrelated fallback values', () => {
    const capabilities = applyRuntimeCapabilities(
      { ...P0_CAPABILITIES, sessionList: 'jsonl' },
      snapshot,
    )
    expect(capabilities).toMatchObject({
      cancel: true,
      open: false,
      rewind: false,
      approval: true,
      permissionMode: true,
      planMode: false,
      promptMode: true,
      sessionList: 'rpc',
    })
  })

  it('keeps legacy configured capabilities when no runtime probe exists', () => {
    const configured = { ...P0_CAPABILITIES, sessionList: 'jsonl' as const }
    const state = refreshRuntimeCapabilities({}, configured)
    expect(state.snapshot).toBeUndefined()
    expect(state.capabilities).toEqual(configured)
  })
})
