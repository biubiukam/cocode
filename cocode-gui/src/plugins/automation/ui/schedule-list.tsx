import { useState } from 'react'
import { Copy, ExternalLink, Trash2 } from 'lucide-react'
import { Badge, Button, Dialog, DialogActions, DialogBody, DialogContent, DialogDescription, DialogTitle } from '@cocode/ui'
import type { SessionId } from '@cocode/gui-connection'
import type { ScheduleRow } from '../store/types.ts'
import { formatScheduleRule, formatScheduledAt, truncatePrompt } from '../store/format.ts'
import { AutomationRow, RowAction, RowMeta } from './list.tsx'

export function ScheduleList({
  rows,
  sessionLabel,
  onOpenSession,
  onCopy,
  onDeleted,
}: {
  rows: readonly ScheduleRow[]
  sessionLabel(sessionId: SessionId): string
  onOpenSession(sessionId: SessionId): void
  onCopy(row: ScheduleRow): void
  onDeleted(row: ScheduleRow): Promise<void>
}) {
  const [pending, setPending] = useState<ScheduleRow | undefined>(undefined)
  const [busy, setBusy] = useState(false)

  return (
    <>
      <ul className="flex flex-col">
        {rows.map(row => (
          <AutomationRow
            key={`${row.sessionId}:${row.id}`}
            badge={(
              <Badge tone={row.displayState === 'overdue' ? 'warning' : 'accent'}>
                {row.displayState === 'overdue'
                  ? (row.deliveryReady ? '到期可送达' : '到期未就绪')
                  : '已安排'}
              </Badge>
            )}
            meta={(
              <>
                {row.deliveryReady ? null : <Badge tone="neutral">会话未就绪</Badge>}
                <RowMeta mono>{formatScheduleRule(row)}</RowMeta>
              </>
            )}
            title={truncatePrompt(row.prompt)}
            titleHint={row.prompt}
            subtitle={(
              <>
                {formatScheduledAt(row.scheduledAt)}
                {' · '}
                {sessionLabel(row.sessionId)}
                {row.displayState === 'overdue' && !row.deliveryReady
                  ? ' · 会话冷态，恢复后才会投递'
                  : null}
              </>
            )}
            actions={(
              <>
                <RowAction icon={<ExternalLink />} label="打开会话" onClick={() => onOpenSession(row.sessionId)} />
                <RowAction icon={<Copy />} label="复制新建" onClick={() => onCopy(row)} />
                <RowAction icon={<Trash2 />} label="删除" danger onClick={() => setPending(row)} />
              </>
            )}
          />
        ))}
      </ul>

      <Dialog open={pending !== undefined} onOpenChange={(open) => { if (!open) setPending(undefined) }}>
        <DialogContent className="w-[min(440px,calc(100vw-48px))]">
          <DialogBody>
            <DialogTitle>删除定时提醒</DialogTitle>
            <DialogDescription>
              删除可能短暂恢复该会话（与 Goal 变更相同）。此操作不可撤销。
            </DialogDescription>
            {pending === undefined ? null : (
              <p className="mt-3 rounded-sm bg-surface-sunken px-2.5 py-2 text-[12px] text-foreground">
                {pending.prompt}
              </p>
            )}
          </DialogBody>
          <DialogActions>
            <Button variant="secondary" disabled={busy} onClick={() => setPending(undefined)}>取消</Button>
            <Button
              variant="danger"
              disabled={busy || pending === undefined}
              onClick={() => {
                if (pending === undefined) return
                setBusy(true)
                void onDeleted(pending).finally(() => {
                  setBusy(false)
                  setPending(undefined)
                })
              }}
            >
              删除
            </Button>
          </DialogActions>
        </DialogContent>
      </Dialog>
    </>
  )
}
