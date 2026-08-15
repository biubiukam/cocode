/** Project durable goal, todo, title, and preset events into UI state. */

import type { SessionEvent } from '@cocode/tui-connection'
import { asNumber, asString, isRecord } from './text.ts'

export type SessionTodo = {
  content: string
  status: 'pending' | 'in_progress' | 'completed'
}

export type SessionGoal = {
  id: string
  revision: number
  objective: string
  phase: 'active' | 'paused' | 'blocked' | 'complete'
  maxGoalRounds: number
  roundsStarted: number
  blockedReason?: { code: string; message: string }
}

export type SessionStateSnapshot = {
  title?: string
  agentPreset?: string
  todos: readonly SessionTodo[]
  goal?: SessionGoal
}

export type SessionStateProjector = {
  ingest(event: SessionEvent): void
  snapshot(): SessionStateSnapshot
  reset(): void
}

export function createSessionStateProjector(): SessionStateProjector {
  return new SessionStateProjectorImpl()
}

class SessionStateProjectorImpl implements SessionStateProjector {
  private title: string | undefined
  private agentPreset: string | undefined
  private todos: SessionTodo[] = []
  private goal: SessionGoal | undefined

  ingest(event: SessionEvent): void {
    const data = isRecord(event.data) ? event.data : {}
    if (event.type === 'todo/write') {
      this.todos = parseTodos(data.todos)
      return
    }
    if (event.type === 'session/title') {
      const title = asString(data.title).trim()
      this.title = title === '' ? undefined : title
      return
    }
    if (event.type === 'agent-preset/selected') {
      const preset = asString(data.agentPreset).trim()
      this.agentPreset = preset === '' ? undefined : preset
      return
    }
    if (event.type === 'user/message') {
      this.ingestGoalMessage(data)
      return
    }
    if (event.type === 'goal/change') {
      this.applyGoalChange(data)
    }
  }

  snapshot(): SessionStateSnapshot {
    return {
      ...(this.title === undefined ? {} : { title: this.title }),
      ...(this.agentPreset === undefined ? {} : { agentPreset: this.agentPreset }),
      todos: this.todos.map((todo) => ({ ...todo })),
      ...(this.goal === undefined ? {} : { goal: cloneGoal(this.goal) }),
    }
  }

  reset(): void {
    this.title = undefined
    this.agentPreset = undefined
    this.todos = []
    this.goal = undefined
  }

  private ingestGoalMessage(data: Record<string, unknown>): void {
    const source = isRecord(data.source) ? data.source : {}
    if (source.kind !== 'goal') return
    const round = Math.max(0, asNumber(source.round))
    if (round > 0) {
      if (this.goal !== undefined) {
        this.goal = { ...this.goal, roundsStarted: Math.max(this.goal.roundsStarted, round) }
      }
      return
    }
    const change = isRecord(source.change) ? source.change : undefined
    if (change !== undefined) this.applyGoalChange(change)
  }

  private applyGoalChange(data: Record<string, unknown>): void {
    const operation = asString(data.operation)
    if (operation === 'clear') {
      this.goal = undefined
      return
    }
    const goal = parseGoal(data.goal)
    if (goal === undefined) return
    const roundsStarted = Math.max(
      goal.roundsStarted,
      asNumber(data.roundsStarted),
      this.goal?.roundsStarted ?? 0,
    )
    this.goal = { ...goal, roundsStarted }
  }
}

function parseTodos(value: unknown): SessionTodo[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!isRecord(item)) return []
    const content = asString(item.content).trim()
    const status = asString(item.status)
    if (
      content === '' ||
      (status !== 'pending' && status !== 'in_progress' && status !== 'completed')
    ) {
      return []
    }
    return [{ content, status }]
  })
}

function parseGoal(value: unknown): SessionGoal | undefined {
  if (!isRecord(value)) return undefined
  const id = asString(value.id).trim()
  const objective = asString(value.objective).trim()
  const phase = asString(value.phase)
  if (
    id === '' ||
    objective === '' ||
    (phase !== 'active' && phase !== 'paused' && phase !== 'blocked' && phase !== 'complete')
  ) {
    return undefined
  }
  const blockedReason = isRecord(value.blockedReason)
    ? {
        code: asString(value.blockedReason.code),
        message: asString(value.blockedReason.message),
      }
    : undefined
  return {
    id,
    revision: Math.max(0, asNumber(value.revision)),
    objective,
    phase,
    maxGoalRounds: Math.max(0, asNumber(value.maxGoalRounds)),
    roundsStarted: Math.max(0, asNumber(value.roundsStarted)),
    ...(blockedReason === undefined ? {} : { blockedReason }),
  }
}

function cloneGoal(goal: SessionGoal): SessionGoal {
  return {
    ...goal,
    ...(goal.blockedReason === undefined ? {} : { blockedReason: { ...goal.blockedReason } }),
  }
}
