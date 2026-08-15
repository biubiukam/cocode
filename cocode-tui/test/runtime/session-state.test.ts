import { describe, expect, it } from 'vitest'
import type { SessionEvent } from '@cocode/tui-connection'
import { createSessionStateProjector } from '../../src/runtime/session-state.ts'

function event(type: string, seq: number, data: unknown): SessionEvent {
  return { type, seq, time: seq, data }
}

describe('SessionStateProjector', () => {
  it('projects todo, title, preset, and goal events', () => {
    const projector = createSessionStateProjector()
    projector.ingest(
      event('todo/write', 1, {
        todos: [
          { content: 'write tests', status: 'completed' },
          { content: 'review UI', status: 'in_progress' },
        ],
      }),
    )
    projector.ingest(event('session/title', 2, { title: 'TUI redesign' }))
    projector.ingest(event('agent-preset/selected', 3, { agentPreset: 'coding' }))
    projector.ingest(
      event('user/message', 4, {
        source: {
          kind: 'goal',
          round: 0,
          change: {
            kind: 'goal/change',
            operation: 'create',
            goal: {
              id: 'g1',
              revision: 1,
              objective: 'ship the TUI',
              phase: 'active',
              maxGoalRounds: 4,
              roundsStarted: 0,
            },
          },
        },
      }),
    )
    projector.ingest(event('user/message', 5, { source: { kind: 'goal', round: 2 } }))

    expect(projector.snapshot()).toEqual({
      title: 'TUI redesign',
      agentPreset: 'coding',
      todos: [
        { content: 'write tests', status: 'completed' },
        { content: 'review UI', status: 'in_progress' },
      ],
      goal: {
        id: 'g1',
        revision: 1,
        objective: 'ship the TUI',
        phase: 'active',
        maxGoalRounds: 4,
        roundsStarted: 2,
      },
    })
  })

  it('clears a goal and ignores malformed todo entries', () => {
    const projector = createSessionStateProjector()
    projector.ingest(
      event('todo/write', 1, {
        todos: [
          { content: '', status: 'pending' },
          { content: 'ok', status: 'bad' },
        ],
      }),
    )
    projector.ingest(
      event('goal/change', 2, {
        operation: 'create',
        goal: {
          id: 'g1',
          revision: 1,
          objective: 'x',
          phase: 'active',
        },
      }),
    )
    projector.ingest(event('goal/change', 3, { operation: 'clear' }))
    expect(projector.snapshot()).toEqual({ todos: [] })
  })
})
