/**
 * Trajectory: the session's raw event stream as a timeline (design system §6.1).
 *
 * The thread shows what the Agent said; this shows what actually happened,
 * including the events the thread deliberately folds away. It reads the session
 * event window directly and needs no wire beyond what already exists.
 */

import { useEffect, useMemo, useRef } from 'react'
import { Activity } from 'lucide-react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Badge, EmptyState, cn } from '@cocode/ui'
import type { SessionEvent } from '@cocode/gui-connection'
import { definePanel, type PanelProps } from '../types.ts'
import { useActiveSession, useSessionSnapshot } from '../../shell/runtime-context.tsx'

/** Coarse category driving the node colour; unknown types read as neutral. */
function toneOf(type: string): 'accent' | 'success' | 'danger' | 'neutral' {
  if (type.startsWith('turn/') || type.startsWith('step/')) return 'accent'
  if (type === 'tool/result') return 'success'
  if (type.endsWith('/error')) return 'danger'
  return 'neutral'
}

function summarize(event: SessionEvent): string {
  const data = event.data
  if (typeof data !== 'object' || data === null) return ''
  const record = data as Record<string, unknown>
  if (typeof record['name'] === 'string') return record['name']
  if (typeof record['reason'] === 'object' && record['reason'] !== null) {
    const kind = (record['reason'] as { kind?: unknown }).kind
    if (typeof kind === 'string') return kind
  }
  if (typeof record['turn'] === 'number') {
    const step = typeof record['step'] === 'number' ? ` · step ${String(record['step'])}` : ''
    return `turn ${String(record['turn'])}${step}`
  }
  if (typeof record['key'] === 'string') return record['key']
  return ''
}

const timeFormat = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

function TrajectoryPanel({ active }: PanelProps) {
  const session = useActiveSession()
  const snapshot = useSessionSnapshot(session)
  const scrollRef = useRef<HTMLDivElement>(null)
  const events = useMemo(() => snapshot?.events ?? [], [snapshot])

  const virtualizer = useVirtualizer({
    count: events.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 58,
    overscan: 12,
  })

  // Following the tail is the point of a trajectory; only do it while visible so a
  // hidden panel cannot fight the user's scroll position in another tab.
  useEffect(() => {
    if (!active || events.length === 0) return
    virtualizer.scrollToIndex(events.length - 1, { align: 'end' })
  }, [active, events.length, virtualizer])

  if (snapshot === undefined) {
    return <EmptyState icon={Activity} title="没有选中的任务" description="从左侧任务列表选择一个任务，这里会显示它的完整事件流。" className="m-4" />
  }
  if (events.length === 0) {
    return <EmptyState icon={Activity} title="暂无事件" description="任务开始运行后，每一个会话事件都会按时间顺序出现在这里。" className="m-4" />
  }

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto px-3 py-2">
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map(row => {
          const event = events[row.index]
          if (event === undefined) return null
          const tone = toneOf(event.type)
          const detail = summarize(event)
          return (
            <div
              key={`${String(event.seq)}:${event.type}`}
              ref={virtualizer.measureElement}
              data-index={row.index}
              className="absolute left-0 top-0 w-full"
              style={{ transform: `translateY(${String(row.start)}px)` }}
            >
              <div className="grid min-h-[58px] grid-cols-[22px_minmax(0,1fr)_auto] items-start gap-2 rounded-sm px-1 py-2">
                <div className="flex h-full flex-col items-center">
                  <span
                    className={cn(
                      'mt-1 size-[10px] shrink-0 rounded-full border',
                      tone === 'accent' && 'border-[color-mix(in_srgb,var(--accent)_40%,var(--border))] bg-accent-soft',
                      tone === 'success' && 'border-[color-mix(in_srgb,var(--success)_40%,var(--border))] bg-success-soft',
                      tone === 'danger' && 'border-[color-mix(in_srgb,var(--danger)_40%,var(--border))] bg-danger-soft',
                      tone === 'neutral' && 'border-border-strong bg-surface-sunken',
                    )}
                  />
                  {row.index < events.length - 1 ? <span className="mt-1 w-px flex-1 bg-border" /> : null}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-mono text-[11px] font-semibold text-foreground">{event.type}</p>
                  {detail === '' ? null : <p className="truncate font-mono text-[10px] text-muted-foreground">{detail}</p>}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="font-mono text-[10px] tabular-nums text-subtle-foreground">{timeFormat.format(event.time)}</span>
                  <Badge tone="neutral">#{event.seq}</Badge>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export const trajectoryPanel = definePanel<void>({
  id: 'trajectory',
  title: '轨迹',
  icon: Activity,
  scope: 'session',
  multiInstance: false,
  preferredDock: 'right',
  render: props => <TrajectoryPanel {...props} />,
})
