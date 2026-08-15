import { describe, expect, it } from 'vitest'
import { formatNoticeLine, truncateLine } from '../../src/present/status-format.ts'

describe('status formatting', () => {
  it('keeps notices to one terminal line', () => {
    expect(formatNoticeLine({ tone: 'error', message: 'first\nsecond' }, 12)).toBe('! first sec…')
  })

  it('removes control characters before truncating', () => {
    expect(formatNoticeLine({ tone: 'info', message: 'ready\u001b[31m now' }, 20)).toBe('· ready now')
  })

  it('handles small limits without returning an empty string', () => {
    expect(truncateLine('hello', 1)).toBe('…')
  })
})
