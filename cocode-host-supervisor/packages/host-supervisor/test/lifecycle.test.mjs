import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createLeaseRecord,
  HOST_ACQUIRE_ABANDONED_MESSAGE,
  isLeaseActive,
} from '../lib/index.js'

const lease = {
  leaseId: 'lease-1',
  clientKind: 'standalone-tui',
  pid: 123,
  createdAt: '2026-08-16T00:00:00.000Z',
  expiresAt: '2026-08-16T00:01:00.000Z',
}

test('an unexpired lease becomes inactive when its owner process exits', () => {
  assert.equal(
    isLeaseActive(lease, Date.parse('2026-08-16T00:00:30.000Z'), () => false),
    false,
  )
})

test('a live owner does not keep an expired lease active', () => {
  assert.equal(
    isLeaseActive(lease, Date.parse('2026-08-16T00:01:00.000Z'), () => true),
    false,
  )
})

test('a live owner keeps an unexpired lease active', () => {
  assert.equal(
    isLeaseActive(lease, Date.parse('2026-08-16T00:00:30.000Z'), () => true),
    true,
  )
})

test('does not create a lease record after the client connection is aborted', () => {
  const controller = new AbortController()
  controller.abort()

  assert.equal(createLeaseRecord({
    leaseId: 'lease-aborted',
    clientKind: 'gui',
    clientPid: 123,
    fallbackPid: 456,
    now: 1_000,
    ttlMs: 30_000,
    signal: controller.signal,
  }), undefined)
})

test('creates a deterministic lease record for an active client connection', () => {
  const controller = new AbortController()

  assert.deepEqual(createLeaseRecord({
    leaseId: 'lease-active',
    clientKind: 'desktop-tui',
    fallbackPid: 456,
    now: 1_000,
    ttlMs: 30_000,
    signal: controller.signal,
  }), {
    leaseId: 'lease-active',
    clientKind: 'desktop-tui',
    pid: 456,
    createdAt: '1970-01-01T00:00:01.000Z',
    expiresAt: '1970-01-01T00:00:31.000Z',
  })
})

test('keeps the abandoned acquire error message stable', () => {
  assert.equal(
    HOST_ACQUIRE_ABANDONED_MESSAGE,
    'Host acquire client disconnected before lease creation',
  )
})
