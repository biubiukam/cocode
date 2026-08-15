import type {
  TuiQuestionAnswer,
  TuiQuestionAnswerItem,
  TuiQuestionItem,
  TuiQuestionRequest,
} from '@cocode/tui-connection'

export type TuiQuestionSnapshot = {
  key: string
  sessionId: string
  question: TuiQuestionItem
  position: number
  total: number
  answered: number
  answer?: TuiQuestionAnswerItem
}

type PendingQuestion = {
  id: number
  request: TuiQuestionRequest
  index: number
  answers: Array<TuiQuestionAnswerItem | undefined>
  resolve: (answer: TuiQuestionAnswer) => void
  reject: (error: Error) => void
}

export type QuestionCoordinator = {
  ask(request: TuiQuestionRequest): Promise<TuiQuestionAnswer>
  snapshot(): TuiQuestionSnapshot | undefined
  answer(selected: string[], custom?: string): void
  navigate(
    direction: 'previous' | 'next',
    selected?: string[],
    custom?: string,
    dirty?: boolean,
  ): void
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
        answered: pending.answers.filter(hasAnswer).length,
        ...(pending.answers[pending.index] === undefined
          ? {}
          : { answer: pending.answers[pending.index] }),
      }
    },

    answer(selected, custom) {
      const pending = active
      const question = pending?.request.questions[pending.index]
      if (pending === undefined || question === undefined) return
      pending.answers[pending.index] = {
        id: question.id,
        selected: [...selected],
        ...(custom === undefined || custom.trim() === '' ? {} : { custom: custom.trim() }),
      }
      if (pending.index >= pending.request.questions.length - 1) {
        if (hasAllAnswers(pending)) {
          settleActive((completed) =>
            completed.resolve({ answers: completed.answers as TuiQuestionAnswer['answers'] }),
          )
        } else {
          options.emit()
        }
        return
      }
      pending.index += 1
      options.emit()
    },

    navigate(direction, selected = [], custom, dirty = false) {
      const pending = active
      const question = pending?.request.questions[pending.index]
      if (pending === undefined || question === undefined) return
      if (dirty) {
        pending.answers[pending.index] = {
          id: question.id,
          selected: [...selected],
          ...(custom === undefined || custom.trim() === '' ? {} : { custom: custom.trim() }),
        }
      }
      if (direction === 'next') {
        if (!hasAnswer(pending.answers[pending.index])) return
        if (pending.index >= pending.request.questions.length - 1) return
        pending.index += 1
      } else {
        if (pending.index === 0) return
        pending.index -= 1
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

function hasAnswer(answer: TuiQuestionAnswerItem | undefined): answer is TuiQuestionAnswerItem {
  return answer !== undefined &&
    (answer.selected.length > 0 || (answer.custom !== undefined && answer.custom.trim() !== ''))
}

function hasAllAnswers(pending: PendingQuestion): boolean {
  return pending.answers.length === pending.request.questions.length &&
    pending.request.questions.every((_, index) => hasAnswer(pending.answers[index]))
}
