import type { TuiSnapshot } from '../../runtime/app.ts'
import { theme } from '../theme.ts'

export function agentMark(agent: TuiSnapshot['agent']): string {
  if (agent === 'running') return '◐'
  if (agent === 'dead') return '×'
  if (agent === 'starting') return '○'
  return '●'
}

export function agentColor(agent: TuiSnapshot['agent']): string {
  if (agent === 'running') return theme.running
  if (agent === 'dead') return theme.error
  if (agent === 'starting') return theme.mute
  return theme.success
}
