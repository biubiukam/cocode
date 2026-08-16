import test from 'node:test'
import assert from 'node:assert/strict'
import { isLeaseActive } from '../lib/index.js'

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
