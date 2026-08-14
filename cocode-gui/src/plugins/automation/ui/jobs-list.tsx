import { useState } from 'react'
import { ExternalLink, Square, Terminal } from 'lucide-react'
import { Badge, Button, Dialog, DialogActions, DialogBody, DialogContent, DialogDescription, DialogTitle } from '@cocode/ui'
import type { SessionId } from '@cocode/gui-connection'
import type { JobRow } from '../store/types.ts'
import { formatJobDuration } from '../store/format.ts'
import { AutomationRow, RowAction, RowMeta } from './list.tsx'

const STATUS_LABEL: Record<JobRow['status'], string> = {
  running: '运行中',
  stopping: '停止中',
  completed: '已完成',
  killed: '已终止',
  failed: '失败',
}

const STATUS_TONE: Record<JobRow['status'], 'accent' | 'warning' | 'success' | 'danger' | 'neutral'> = {
  running: 'accent',
  stopping: 'warning',
  completed: 'success',
  killed: 'neutral',
  failed: 'danger',
}

export function JobsList({
  rows,
  canMutate,
  sessionLabel,
  onOpenSession,
  onKill,
  onOutput,
}: {
  rows: readonly JobRow[]
  canMutate: boolean
  sessionLabel(sessionId: SessionId): string
  onOpenSession(sessionId: SessionId): void
  onKill(row: JobRow): Promise<void>
  onOutput(row: JobRow): Promise<{ text: string } | { error: string }>
}) {
  const [output, setOutput] = useState<{ label: string; text: string } | undefined>(undefined)
  const [busyId, setBusyId] = useState<string | undefined>(undefined)

  return (
    <>
      <ul className="flex flex-col">
        {rows.map(row => (
          <AutomationRow
            key={`${row.sessionId}:${row.id}`}
            badge={<Badge tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Badge>}
            meta={(
              <>
                <RowMeta mono>{row.kind}</RowMeta>
                <RowMeta mono>{formatJobDuration(row)}</RowMeta>
              </>
            )}
            title={row.label}
            subtitle={(
              <>
                {sessionLabel(row.sessionId)}
                {row.detail === undefined ? null : ` · ${row.detail}`}
              </>
            )}
            actions={(
              <>
                <RowAction icon={<ExternalLink />} label="打开会话" onClick={() => onOpenSession(row.sessionId)} />
                {canMutate
                  ? (
                      <RowAction
                        icon={<Terminal />}
                        label="查看输出"
                        disabled={busyId === row.id}
                        onClick={() => {
                          setBusyId(row.id)
                          void onOutput(row).then((result) => {
                            setBusyId(undefined)
                            if ('error' in result) {
                              setOutput({ label: row.label, text: result.error })
                              return
                            }
                            setOutput({ label: row.label, text: result.text || '（无输出）' })
                          })
                        }}
                      />
                    )
                  : null}
                {canMutate && (row.status === 'running' || row.status === 'stopping')
                  ? (
                      <RowAction
                        icon={<Square />}
                        label="停止"
                        disabled={busyId === row.id}
                        onClick={() => {
                          setBusyId(row.id)
                          void onKill(row).finally(() => setBusyId(undefined))
                        }}
                      />
                    )
                  : null}
              </>
            )}
          />
        ))}
      </ul>

      <Dialog open={output !== undefined} onOpenChange={(open) => { if (!open) setOutput(undefined) }}>
        <DialogContent className="w-[min(640px,calc(100vw-48px))]">
          <DialogBody>
            <DialogTitle>任务输出</DialogTitle>
            <DialogDescription>{output?.label}</DialogDescription>
            <pre className="mt-3 max-h-[360px] overflow-auto rounded-md border border-border bg-surface-sunken p-3 font-mono text-[11px] leading-[1.45] text-foreground whitespace-pre-wrap">
              {output?.text}
            </pre>
          </DialogBody>
          <DialogActions>
            <Button variant="secondary" onClick={() => setOutput(undefined)}>关闭</Button>
          </DialogActions>
        </DialogContent>
      </Dialog>
    </>
  )
}
