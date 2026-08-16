import { describe, expect, it } from 'vitest'
import { handleNotification } from '../../src/runtime/notification.ts'

describe('handleNotification', () => {
  function hostWithEvents(events: string[]) {
    return {
      sessionId: 'parent',
      ingest: () => {},
      isDeadOrExiting: () => false,
      setAgent: (status: 'idle' | 'running') => events.push(`status:${status}`),
      clearInterrupt: () => events.push('clear'),
      subagentStarted: (id: string) => `started:${id}`,
      subagentFinished: (id: string) => `finished:${id}`,
      notice: (message: string) => events.push(`notice:${message}`),
      fail: (message: string) => events.push(`fail:${message}`),
      emit: () => {},
    }
  }

  it('waits for turn/end before showing a final error', () => {
    const events: string[] = []
    const host = hostWithEvents(events)
    handleNotification({
      method: 'session.event',
      params: {
        sessionId: 'parent',
        event: {
          type: 'assistant/chunk',
          seq: 1,
          time: 1,
          data: {
            chunk: {
              type: 'finish',
              reason: { kind: 'error', failure: { message: 'retrying' } },
            },
          },
        },
      },
    }, host)
    expect(events).toEqual([])

    handleNotification({
      method: 'session.event',
      params: {
        sessionId: 'parent',
        event: {
          type: 'turn/end',
          seq: 2,
          time: 2,
          data: { reason: { kind: 'error', error: { message: 'final failure' } } },
        },
      },
    }, host)
    expect(events).toEqual(['fail:final failure', 'status:idle', 'clear'])
  })

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
      fail: (message: string) => events.push(`fail:${message}`),
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
