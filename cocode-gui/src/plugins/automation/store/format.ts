import type { JobView, ScheduleListItem } from '@cocode/gui-connection'
import type { ScheduleDisplayState } from './types.ts'

const PROMPT_MAX = 80

/** Truncate reminder prompt for list rows; full text stays on the wire item. */
export function truncatePrompt(prompt: string): string {
  const trimmed = prompt.trim()
  if (trimmed.length <= PROMPT_MAX) return trimmed
  return `${trimmed.slice(0, PROMPT_MAX - 1)}…`
}

export function scheduleDisplayState(item: ScheduleListItem, now: number): ScheduleDisplayState {
  const at = Date.parse(item.scheduledAt)
  if (!Number.isFinite(at)) return item.state
  return at <= now ? 'overdue' : 'scheduled'
}

export function formatScheduleRule(item: ScheduleListItem): string {
  if (item.kind === 'after') return `${String(item.afterSeconds)} 秒后`
  if (item.kind === 'every') return `每 ${String(item.everySeconds)} 秒`
  return '指定时间'
}

export function formatScheduledAt(iso: string): string {
  const at = Date.parse(iso)
  if (!Number.isFinite(at)) return iso
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(at)
}

export function formatJobDuration(job: JobView): string {
  const end = job.finishedAt ?? Date.now()
  const seconds = Math.max(0, Math.round((end - job.startedAt) / 1000))
  if (seconds < 60) return `${String(seconds)}s`
  const minutes = Math.floor(seconds / 60)
  return `${String(minutes)}m ${String(seconds % 60)}s`
}

export function nextScheduleRefreshAt(items: readonly ScheduleListItem[], now: number): number | undefined {
  let soonest: number | undefined
  for (const item of items) {
    const at = Date.parse(item.scheduledAt)
    if (!Number.isFinite(at) || at <= now) continue
    if (soonest === undefined || at < soonest) soonest = at
  }
  return soonest
}
