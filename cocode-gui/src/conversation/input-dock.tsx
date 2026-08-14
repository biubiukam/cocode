/**
 * The strip above the Composer: todos, the pending inbox, and the goal (RFC §6.2).
 *
 * Each row exists only when its source has something to say. All three are
 * authoritative host state — the todo list is the latest whole-list `todo/write`,
 * the queue is the whole `session/queue` snapshot, and the goal is its projection —
 * so nothing here is mirrored or reconciled locally.
 */

import { Circle, CircleCheck, CircleDot, Flag, Pause, Play, Send, Target, X } from 'lucide-react'
import { Badge, IconButton, Tooltip, cn } from '@cocode/ui'
import type { GoalProjection, QueuedInboxItem, TodoItem } from '@cocode/gui-connection'
import { blocksToText } from '../runtime/index.ts'
import { SlotOutlet } from '../boot/slot-renderer.tsx'

const TODO_ICON = {
  pending: Circle,
  in_progress: CircleDot,
  completed: CircleCheck,
  cancelled: X,
} as const

export type InputDockProps = {
  todos: readonly TodoItem[]
  queue: readonly QueuedInboxItem[]
  goal: GoalProjection | null
  onRemoveQueued(itemId: string): void
  onSteerQueued(itemId: string): void
  onPauseGoal(): void
  onResumeGoal(): void
  onCompleteGoal(): void
}

export function TodoStrip({ todos }: { todos: readonly TodoItem[] }) {
  const done = todos.filter(todo => todo.status === 'completed').length
  const current = todos.find(todo => todo.status === 'in_progress') ?? todos.find(todo => todo.status === 'pending')
  if (current === undefined) return null
  const Icon = TODO_ICON[current.status]
  return (
    <div className="flex min-h-[32px] items-center gap-2 border-t border-border px-5 text-[11px]">
      <Icon className={cn('size-3.5 shrink-0', current.status === 'in_progress' ? 'text-accent-ink' : 'text-muted-foreground')} />
      <span className="min-w-0 flex-1 truncate text-secondary-foreground">{current.content}</span>
      <span className="shrink-0 font-mono tabular-nums text-subtle-foreground">{done}/{todos.length}</span>
    </div>
  )
}

export function GoalStrip({ goal, onPause, onResume, onComplete }: {
  goal: GoalProjection
  onPause(): void
  onResume(): void
  onComplete(): void
}) {
  const { phase } = goal.goal
  return (
    <div className="flex min-h-[32px] items-center gap-2 border-t border-border px-5 text-[11px]">
      <Target className="size-3.5 shrink-0 text-accent-ink" />
      <span className="min-w-0 flex-1 truncate text-secondary-foreground">{goal.goal.objective}</span>
      <span className="shrink-0 font-mono tabular-nums text-subtle-foreground">
        {goal.roundsStarted}/{goal.goal.maxGoalRounds}
      </span>
      {phase === 'blocked'
        ? <Badge tone="warning">{goal.goal.blockedReason?.code ?? 'blocked'}</Badge>
        : <Badge tone={phase === 'complete' ? 'success' : phase === 'paused' ? 'neutral' : 'accent'}>{phase}</Badge>}
      {phase === 'active'
        ? <IconButton size="xs" label="暂停目标" onClick={onPause}><Pause /></IconButton>
        : phase === 'paused'
          ? <IconButton size="xs" label="继续目标" onClick={onResume}><Play /></IconButton>
          : null}
      {phase === 'complete'
        ? null
        : <IconButton size="xs" label="标记目标完成" onClick={onComplete}><Flag /></IconButton>}
    </div>
  )
}

export function QueueStrip({ items, onRemove, onSteer }: {
  items: readonly QueuedInboxItem[]
  onRemove(itemId: string): void
  onSteer(itemId: string): void
}) {
  // Context items are claimed silently by the Agent and have no user meaning.
  const visible = items.filter(item => item.placement !== 'context')
  if (visible.length === 0) return null
  return (
    <div className="flex flex-col border-t border-border">
      {visible.map(item => (
        <div key={item.id} className="flex min-h-[32px] items-center gap-2 px-5 text-[11px]">
          <Badge tone={item.placement === 'steering' ? 'accent' : 'neutral'}>
            {item.placement === 'steering' ? '引导' : '排队'}
          </Badge>
          <span className="min-w-0 flex-1 truncate text-secondary-foreground">{blocksToText(item.message.content)}</span>
          {item.placement === 'queued'
            ? (
                <Tooltip content="立即插入为引导">
                  <IconButton size="xs" label="立即插入为引导" onClick={() => onSteer(item.id)}><Send /></IconButton>
                </Tooltip>
              )
            : null}
          <IconButton size="xs" label="移除这条排队消息" onClick={() => onRemove(item.id)}><X /></IconButton>
        </div>
      ))}
    </div>
  )
}

export function InputDock(props: InputDockProps) {
  const hasTodos = props.todos.length > 0
  const hasQueue = props.queue.some(item => item.placement !== 'context')
  if (!hasTodos && !hasQueue && props.goal === null) return null

  return (
    <div className="shrink-0 bg-surface">
      <SlotOutlet name="conversation.utilities" owner={props} />
    </div>
  )
}
