import { describe, expect, it } from 'vitest'
import { PromptQueueCoordinator } from '../../src/runtime/prompt-queue-coordinator.ts'

describe('prompt queue coordinator', () => {
  it('keeps queue order and picker projection synchronized', () => {
    const queue = new PromptQueueCoordinator()
    expect(queue.add('second', [], [])).toBe(true)
    expect(queue.add('third', [], [])).toBe(true)
    expect(queue.open()).toBe(true)

    queue.move(1)
    expect(queue.prioritizeSelected()).toBe(true)
    expect(queue.picker?.items.map((item) => item.text)).toEqual(['third', 'second'])

    queue.deleteSelected()
    expect(queue.picker?.items.map((item) => item.text)).toEqual(['second'])
    expect(queue.size).toBe(1)
  })

  it('rejects restores from a cleared queue generation', () => {
    const queue = new PromptQueueCoordinator()
    queue.add('queued', [], [])
    const ticket = queue.take()
    expect(ticket).toBeDefined()

    queue.clear()

    expect(ticket === undefined ? undefined : queue.restore(ticket)).toBe(false)
    expect(queue.size).toBe(0)
  })
})
