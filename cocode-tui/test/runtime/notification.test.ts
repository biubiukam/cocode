import { describe, expect, it } from 'vitest'
import { handleNotification } from '../../src/runtime/notification.ts'

describe('handleNotification', () => {
  it('routes subagent lifecycle only for the active parent session', () => {
    const events: string[] = []
    const host = {
      sessionId: 'parent',
      ingest: () => {},
      isDeadOrExiting: () => false,
      setAgent: () => {},
      clearInterrupt: () => {},
      subagentStarted: (id: string) => {
        events.push(`start:${id}`)
        return `started:${id}`
      },
      subagentFinished: (id: string) => {
        events.push(`finish:${id}`)
        return `finished:${id}`
      },
      notice: (message: string) => events.push(`notice:${message}`),
      emit: () => {},
    }
    handleNotification(
      {
        method: 'subagent.started',
        params: { parentSessionId: 'other', childSessionId: 'ignored' },
      },
      host,
    )
    handleNotification(
      {
        method: 'subagent.started',
        params: { parentSessionId: 'parent', childSessionId: 'child' },
      },
      host,
    )
    handleNotification(
      {
        method: 'subagent.finished',
        params: {
          provider: 'p',
          agentId: 'a',
          parentSessionId: 'parent',
          childSessionId: 'child',
          status: 'ok',
        },
      },
      host,
    )
    expect(events).toEqual([
      'start:child',
      'notice:started:child',
      'finish:child',
      'notice:finished:child',
    ])
  })
})
