/**
 * Presentation primitives shared by the three automation directories.
 *
 * The Segmented switch promises three views of one thing, so the row grammar and
 * the container are owned here rather than re-invented per segment: schedules,
 * jobs and workflow runs differ in their copy and actions, never in their shape.
 */

import type { ComponentProps, ReactNode } from 'react'
import { IconButton, cn } from '@cocode/ui'

/** The §4 panel a populated directory lives in; the count is its only chrome. */
export function ListPanel({ title, count, children }: {
  title: string
  count: number
  children: ReactNode
}) {
  return (
    <section className="panel overflow-hidden">
      <header className="panel-header">
        <strong>{title}</strong>
        <span>{`${String(count)} 条`}</span>
      </header>
      {children}
    </section>
  )
}

/**
 * One data row: square corners and a hairline rule, because a directory is a
 * table of comparable things, not a stack of cards competing for attention.
 */
export function AutomationRow({ badge, meta, title, titleHint, subtitle, actions, detail }: {
  badge: ReactNode
  /** Status qualifiers sitting beside the badge, e.g. a rule or a duration. */
  meta?: ReactNode
  title: string
  /** Untruncated title for the native hover, when the row shows a summary. */
  titleHint?: string
  subtitle: ReactNode
  actions: ReactNode
  /** Expanded region below the row, rendered outside the action grid. */
  detail?: ReactNode
}) {
  return (
    <li className="border-b border-border last:border-b-0">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-[18px] py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {badge}
            {meta}
          </div>
          <p className="mt-1.5 truncate text-[13px] text-foreground" title={titleHint}>{title}</p>
          <p className="mt-1 truncate text-[11px] text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">{actions}</div>
      </div>
      {detail}
    </li>
  )
}

export type RowActionProps = Omit<ComponentProps<'button'>, 'children'> & {
  icon: ReactNode
  label: string
  danger?: boolean
}

/** Row affordances are icon-only: three labelled buttons per row shout over the data. */
export function RowAction({ icon, label, danger = false, className, ...props }: RowActionProps) {
  return (
    <IconButton size="sm" label={label} className={cn(danger && 'text-danger', className)} {...props}>
      {icon}
    </IconButton>
  )
}

/** Secondary text inside a row: 11px, mono only where the value is machine data. */
export function RowMeta({ mono = false, children }: { mono?: boolean; children: ReactNode }) {
  return <span className={cn('text-[11px] text-muted-foreground', mono && 'font-mono')}>{children}</span>
}
