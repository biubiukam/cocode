import { describe, expect, it, vi } from 'vitest'
import type { TuiQuestionRequest } from '@cocode/tui-connection'
import { createQuestionCoordinator } from '../../src/runtime/question-coordinator.ts'

const request = (sessionId: string, ...ids: string[]): TuiQuestionRequest => ({
  sessionId,
  questions: ids.map((id) => ({ id, question: `Question ${id}` })),
})

describe('question coordinator', () => {
  it('serializes requests and resolves every answer in order', async () => {
    const emit = vi.fn()
    const coordinator = createQuestionCoordinator({ emit })
    const first = coordinator.ask(request('s1', 'first', 'second'))
    const second = coordinator.ask(request('s2', 'later'))

    expect(coordinator.snapshot()).toMatchObject({
      sessionId: 's1',
      position: 1,
      total: 2,
    })
    coordinator.answer(['a'], '  custom  ')
    expect(coordinator.snapshot()).toMatchObject({ position: 2, answered: 1 })
    coordinator.answer(['b'])
    await expect(first).resolves.toEqual({
      answers: [
        { id: 'first', selected: ['a'], custom: 'custom' },
        { id: 'second', selected: ['b'] },
      ],
    })
    expect(coordinator.snapshot()).toMatchObject({ sessionId: 's2', position: 1 })
    coordinator.answer(['c'])
    await expect(second).resolves.toEqual({ answers: [{ id: 'later', selected: ['c'] }] })
    expect(coordinator.snapshot()).toBeUndefined()
    expect(emit).toHaveBeenCalled()
  })

  it('rejects the active question on cancel and continues with queued work', async () => {
    const coordinator = createQuestionCoordinator({ emit: () => undefined })
    const first = coordinator.ask(request('s1', 'first'))
    const second = coordinator.ask(request('s2', 'second'))
    coordinator.cancel()
    await expect(first).rejects.toThrow('interrupted')
    expect(coordinator.snapshot()).toMatchObject({ sessionId: 's2' })
    coordinator.answer(['ok'])
    await expect(second).resolves.toEqual({ answers: [{ id: 'second', selected: ['ok'] }] })
  })

  it('rejects active and queued requests during shutdown', async () => {
    const coordinator = createQuestionCoordinator({ emit: () => undefined })
    const first = coordinator.ask(request('s1', 'first'))
    const second = coordinator.ask(request('s2', 'second'))
    coordinator.rejectAll(new Error('closed'))
    await expect(first).rejects.toThrow('closed')
    await expect(second).rejects.toThrow('closed')
    expect(coordinator.snapshot()).toBeUndefined()
  })
})
