import { describe, expect, it } from 'vitest'
import type { TuiQuestionAnswer, TuiQuestionRequest, TuiRuntime } from '@cocode/tui-connection'
import { createTuiApp } from '../../src/runtime/app.ts'

describe('question cancellation', () => {
  it('cancels the active runtime turn when the user presses Esc', async () => {
    let handler: ((request: TuiQuestionRequest) => Promise<TuiQuestionAnswer>) | undefined
    const cancels: { sessionId: string; keepInbox: boolean }[] = []
    const runtime = {
      async start() {
        return { name: 'test-runtime', version: '1' }
      },
      async prompt() {
        return 'message-1'
      },
      async cancel(sessionId: string, keepInbox = false) {
        cancels.push({ sessionId, keepInbox })
        return true
      },
      onQuestion(next: (request: TuiQuestionRequest) => Promise<TuiQuestionAnswer>) {
        handler = next
        return () => {
          if (handler === next) handler = undefined
        }
      },
      subscribe() {
        return () => undefined
      },
      async close() {},
      async askQuestion(request: TuiQuestionRequest) {
        if (handler === undefined) throw new Error('question handler unavailable')
        return handler(request)
      },
    } as unknown as TuiRuntime & {
      askQuestion: (request: TuiQuestionRequest) => Promise<TuiQuestionAnswer>
    }

    const app = createTuiApp({
      runtime,
      cwd: '/tmp',
      provider: 'test-provider',
      model: 'test-model',
      sessionId: 'session-1',
    })
    await app.start()

    const answer = runtime.askQuestion({
      sessionId: 'session-1',
      questions: [{ id: 'goal', question: 'What should we build?' }],
    })
    expect(app.snapshot().question).toBeDefined()

    app.dispatch({ type: 'question.cancel' })

    await expect(answer).rejects.toThrow('interrupted')
    expect(cancels).toEqual([{ sessionId: 'session-1', keepInbox: false }])
    await app.close()
  })
})
