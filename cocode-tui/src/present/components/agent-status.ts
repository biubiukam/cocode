import type { TuiSnapshot } from '../../runtime/app.ts'
import { theme } from '../theme.ts'

export type AgentStatusAnimation = {
  frames: readonly string[]
  interval: number
}

const IDLE_ANIMATION: AgentStatusAnimation = { frames: ['●'], interval: 0 }
const RUNNING_ANIMATION: AgentStatusAnimation = {
  frames: ['◐', '◓', '◑', '◒'],
  interval: 140,
}
const STARTING_ANIMATION: AgentStatusAnimation = {
  frames: ['○', '◌', '◍', '◌'],
  interval: 180,
}
const DEAD_ANIMATION: AgentStatusAnimation = { frames: ['×'], interval: 0 }

export function agentAnimation(agent: TuiSnapshot['agent']): AgentStatusAnimation {
  if (agent === 'running') return RUNNING_ANIMATION
  if (agent === 'starting') return STARTING_ANIMATION
  if (agent === 'dead') return DEAD_ANIMATION
  return IDLE_ANIMATION
}

export function agentMark(agent: TuiSnapshot['agent']): string {
  return agentAnimation(agent).frames[0] ?? '●'
}

export function agentColor(agent: TuiSnapshot['agent']): string {
  if (agent === 'running') return theme.running
  if (agent === 'dead') return theme.error
  if (agent === 'starting') return theme.mute
  return theme.success
}
