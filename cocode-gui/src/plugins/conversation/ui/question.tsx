import type { AskUserQuestionItem } from '@cocode/gui-connection'
import type { QuestionAnswer } from '../../../runtime/index.ts'
import { QuestionCard } from '../../../conversation/question-card.tsx'

export function QuestionComposer(props: {
  question?: { rpcId: string; questions: AskUserQuestionItem[] }
  onAnswer(answers: QuestionAnswer[]): void
  onCancelQuestion(): void
}) {
  if (props.question === undefined) return null
  return (
    <QuestionCard
      questions={props.question.questions}
      onAnswer={props.onAnswer}
      onCancel={props.onCancelQuestion}
    />
  )
}
