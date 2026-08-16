import { describe, expect, it } from 'vitest'
import { agentColor, agentFrames, agentMark } from '../../src/present/components/agent-status.ts'

describe('agent status visuals', () => {
  it('keeps idle and dead indicators static', () => {
    expect(agentFrames('idle')).toHaveLength(1)
    expect(agentFrames('dead')).toHaveLength(1)
  })

  it('uses distinct animated frames for connecting and running states', () => {
    expect(agentFrames('starting').length).toBeGreaterThan(1)
    expect(agentFrames('running').length).toBeGreaterThan(1)
    expect(agentFrames('starting')).not.toEqual(agentFrames('running'))
  })

  it('keeps the first frame compatible with the existing static mark API', () => {
    expect(agentMark('running')).toBe(agentFrames('running')[0])
    expect(agentColor('dead')).toBeDefined()
  })
})
