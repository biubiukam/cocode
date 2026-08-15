import { describe, expect, it } from 'vitest'
import { createPromptQueue, type QueuedPrompt } from '../../src/runtime/prompt-queue.ts'

const prompt = (text: string): QueuedPrompt => ({ text, attachments: [] })

describe('prompt queue', () => {
  it('preserves FIFO ordering and restores failed prompts at the front', () => {
    const queue = createPromptQueue(2)
    expect(queue.add(prompt('first'))).toBe(true)
    expect(queue.add(prompt('second'))).toBe(true)
    expect(queue.add(prompt('third'))).toBe(false)
    expect(queue.size).toBe(2)

    const first = queue.take()
    expect(first?.text).toBe('first')
    if (first !== undefined) queue.restore(first)
    expect(queue.take()?.text).toBe('first')
    expect(queue.take()?.text).toBe('second')
    expect(queue.take()).toBeUndefined()
  })

  it('clears queued prompts and normalizes invalid limits', () => {
    const queue = createPromptQueue(0)
    expect(queue.limit).toBe(8)
    queue.add(prompt('one'))
    queue.clear()
    expect(queue.size).toBe(0)
  })
})
