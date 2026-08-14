/**
 * One task row (design system §6.6).
 *
 * The badge shows only what the wire actually asserts: `running` from
 * `host/session-status`, and the blank bit from the list summary. Cocode does not
 * invent `paused` or `completed` session states — a badge the model never emitted
 * is a badge that will eventually be wrong (RFC §6.1).
 */

import { Badge, Skeleton, cn } from '@cocode/ui'
import type { SessionSummary } from '@cocode/gui-connection'

export type SessionRowProps = {
  summary: SessionSummary
  title: string | undefined
  /** Shown under the title in flat list mode. */
  projectTitle?: string
  selected: boolean
  onSelect(): void
}

export function SessionRow({ summary, title, projectTitle, selected, onSelect }: SessionRowProps) {
  const label = summary.blank ? '新任务' : title
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'flex min-h-[44px] w-full items-center gap-2 border-b border-border px-[18px] text-left text-[11px]',
        'transition-colors duration-150 hover:bg-surface-sunken',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'size-1.5 shrink-0 rounded-full',
          summary.running ? 'cocode-pulse bg-accent' : 'bg-border-strong',
        )}
      />
      <span className={cn('min-w-0 flex-1', selected ? 'font-semibold text-foreground' : 'text-secondary-foreground')}>
        {label === undefined
          ? <Skeleton className="h-[11px] w-[70%]" />
          : (
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className={cn('truncate', summary.blank && 'text-subtle-foreground')}>{label}</span>
                {projectTitle === undefined
                  ? null
                  : <span className="truncate text-[10px] font-normal text-subtle-foreground">{projectTitle}</span>}
              </span>
            )}
      </span>
      {summary.running ? <Badge tone="accent">running</Badge> : null}
    </button>
  )
}
