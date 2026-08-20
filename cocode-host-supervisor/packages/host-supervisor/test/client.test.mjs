import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveSupervisorClientTimeouts } from '../lib/index.js'

test('uses cold-start budgets for Supervisor startup and Host acquisition', () => {
  assert.deepEqual(resolveSupervisorClientTimeouts(), {
    startupTimeoutMs: 60_000,
    acquireTimeoutMs: 180_000,
  })
})

test('allows focused tests and controlled clients to override cold-start budgets', () => {
  assert.deepEqual(resolveSupervisorClientTimeouts({
    startupTimeoutMs: 25,
    acquireTimeoutMs: 50,
  }), {
    startupTimeoutMs: 25,
    acquireTimeoutMs: 50,
  })
})
