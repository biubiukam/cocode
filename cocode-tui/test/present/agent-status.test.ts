import { describe, expect, it } from 'vitest'
import { agentAnimation, agentColor, agentMark } from '../../src/present/components/agent-status.ts'

describe('agent status visuals', () => {
  it('keeps idle and dead indicators static', () => {
    expect(agentAnimation('idle')).toEqual({ frames: ['●'], interval: 0 })
    expect(agentAnimation('dead')).toEqual({ frames: ['×'], interval: 0 })
  })

  it('uses distinct animated frames for connecting and running states', () => {
    expect(agentAnimation('starting').frames).toEqual(['○', '◌', '◍', '◌'])
    expect(agentAnimation('running').frames).toEqual(['◐', '◓', '◑', '◒'])
    expect(agentAnimation('starting').interval).toBeGreaterThan(agentAnimation('running').interval)
  })

  it('keeps the first frame compatible with the existing static mark API', () => {
    expect(agentMark('running')).toBe('◐')
    expect(agentColor('dead')).toBeDefined()
  })
})
