import type { TuiQuestionAnswer, TuiQuestionItem, TuiQuestionRequest } from '@cocode/tui-connection'

export type TuiQuestionSnapshot = {
  key: string
  sessionId: string
  question: TuiQuestionItem
  position: number
  total: number
  answered: number
}

type PendingQuestion = {
  id: number
  request: TuiQuestionRequest
  index: number
  answers: TuiQuestionAnswer['answers']
  resolve: (answer: TuiQuestionAnswer) => void
  reject: (error: Error) => void
}

export type QuestionCoordinator = {
  ask(request: TuiQuestionRequest): Promise<TuiQuestionAnswer>
  snapshot(): TuiQuestionSnapshot | undefined
  answer(selected: string[], custom?: string): void
  cancel(): void
  rejectAll(error: Error): void
}

/**
 * Serializes runtime questions so only one question reaches the TUI at a
 * time. The coordinator owns promise settlement and queue transitions; the
 * app only projects its snapshot and forwards user actions.
 */
export function createQuestionCoordinator(options: { emit: () => void }): QuestionCoordinator {
  const queue: PendingQuestion[] = []
  let active: PendingQuestion | undefined
  let serial = 0

  const startNext = (): void => {
    if (active !== undefined || queue.length === 0) return
    active = queue.shift()
    options.emit()
  }

  const settleActive = (settle: (pending: PendingQuestion) => void): void => {
    const pending = active
    if (pending === undefined) return
    active = undefined
    settle(pending)
    startNext()
    options.emit()
  }

  return {
    ask(request) {
      return new Promise<TuiQuestionAnswer>((resolve, reject) => {
        queue.push({
          id: ++serial,
          request,
          index: 0,
          answers: [],
          resolve,
          reject,
        })
        startNext()
      })
    },

    snapshot() {
      const pending = active
      if (pending === undefined) return undefined
      const question = pending.request.questions[pending.index]
      if (question === undefined) return undefined
      return {
        key: `${pending.id}-${pending.index}`,
        sessionId: pending.request.sessionId,
        question,
        position: pending.index + 1,
        total: pending.request.questions.length,
        answered: pending.answers.length,
      }
    },

    answer(selected, custom) {
      const pending = active
      const question = pending?.request.questions[pending.index]
      if (pending === undefined || question === undefined) return
      pending.answers.push({
        id: question.id,
        selected: [...selected],
        ...(custom === undefined || custom.trim() === '' ? {} : { custom: custom.trim() }),
      })
      pending.index += 1
      if (pending.index >= pending.request.questions.length) {
        settleActive((completed) => completed.resolve({ answers: [...completed.answers] }))
        return
      }
      options.emit()
    },

    cancel() {
      settleActive((cancelled) =>
        cancelled.reject(new Error('ask_user_question was interrupted before the user answered')),
      )
    },

    rejectAll(error) {
      const pending = active
      active = undefined
      if (pending !== undefined) pending.reject(error)
      for (const queued of queue.splice(0)) queued.reject(error)
      options.emit()
    },
  }
}
