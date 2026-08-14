import type { GoalProjection, QueuedInboxItem, TodoItem } from '@cocode/gui-connection'
import { GoalStrip, QueueStrip, TodoStrip } from '../../../conversation/input-dock.tsx'

export function GoalUtility(props: {
  goal: GoalProjection | null
  onPauseGoal(): void
  onResumeGoal(): void
  onCompleteGoal(): void
}) {
  if (props.goal === null) return null
  return (
    <GoalStrip
      goal={props.goal}
      onPause={props.onPauseGoal}
      onResume={props.onResumeGoal}
      onComplete={props.onCompleteGoal}
    />
  )
}

export function TodoUtility(props: { todos: readonly TodoItem[] }) {
  if (props.todos.length === 0) return null
  return <TodoStrip todos={props.todos} />
}

export function QueueUtility(props: {
  queue: readonly QueuedInboxItem[]
  onRemoveQueued(itemId: string): void
  onSteerQueued(itemId: string): void
}) {
  return <QueueStrip items={props.queue} onRemove={props.onRemoveQueued} onSteer={props.onSteerQueued} />
}
