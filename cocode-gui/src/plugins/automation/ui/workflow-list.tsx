import { useState } from 'react'
import { ChevronDown, ExternalLink, Square } from 'lucide-react'
import { Badge, cn } from '@cocode/ui'
import type { SessionId } from '@cocode/gui-connection'
import type { WorkflowRow } from '../store/types.ts'
import { AutomationRow, RowAction, RowMeta } from './list.tsx'

const STATUS_LABEL: Record<WorkflowRow['status'], string> = {
  running: '运行中',
  interrupted: '已中断',
  completed: '已完成',
  cancelled: '已取消',
  error: '错误',
}

const STATUS_TONE: Record<WorkflowRow['status'], 'accent' | 'warning' | 'success' | 'danger' | 'neutral'> = {
  running: 'accent',
  interrupted: 'warning',
  completed: 'success',
  cancelled: 'neutral',
  error: 'danger',
}

export function WorkflowList({
  rows,
  canCancel,
  sessionLabel,
  onOpenSession,
  onCancel,
}: {
  rows: readonly WorkflowRow[]
  canCancel: boolean
  sessionLabel(sessionId: SessionId): string
  onOpenSession(sessionId: SessionId): void
  onCancel(row: WorkflowRow): Promise<void>
}) {
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(new Set())
  const [busyId, setBusyId] = useState<string | undefined>(undefined)

  const toggle = (key: string) => {
    setOpenIds((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <ul className="flex flex-col">
      {rows.map(row => {
        const key = `${row.sessionId}:${row.runId}`
        const expanded = openIds.has(key)
        return (
          <AutomationRow
            key={key}
            badge={<Badge tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Badge>}
            meta={row.agentsStarted > 0 ? <RowMeta>{`${String(row.agentsStarted)} 个成员`}</RowMeta> : null}
            title={row.name}
            subtitle={(
              <>
                {sessionLabel(row.sessionId)}
                {' · '}
                <span className="font-mono">{row.runId}</span>
              </>
            )}
            actions={(
              <>
                {row.agents.length > 0
                  ? (
                      <RowAction
                        icon={<ChevronDown className={cn('transition-transform', expanded && 'rotate-180')} />}
                        label={expanded ? '收起成员' : '展开成员'}
                        aria-expanded={expanded}
                        onClick={() => toggle(key)}
                      />
                    )
                  : null}
                <RowAction icon={<ExternalLink />} label="打开会话" onClick={() => onOpenSession(row.sessionId)} />
                {canCancel && row.live
                  ? (
                      <RowAction
                        icon={<Square />}
                        label="取消工作流"
                        disabled={busyId === key}
                        onClick={() => {
                          setBusyId(key)
                          void onCancel(row).finally(() => setBusyId(undefined))
                        }}
                      />
                    )
                  : null}
              </>
            )}
            detail={expanded
              ? (
                  <ul className="border-t border-border px-[18px] py-2">
                    {row.agents.map(agent => (
                      <li key={String(agent.seq)} className="flex items-center gap-2 py-1 text-[11px] text-muted-foreground">
                        <span className="font-mono">{`#${String(agent.seq)}`}</span>
                        <span className="min-w-0 truncate text-foreground">{agent.label}</span>
                        {agent.phase === undefined ? null : <span>{agent.phase}</span>}
                        {agent.outcome === undefined ? null : <span>{agent.outcome}</span>}
                      </li>
                    ))}
                  </ul>
                )
              : undefined}
          />
        )
      })}
    </ul>
  )
}
