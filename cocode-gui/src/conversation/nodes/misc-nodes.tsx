/**
 * Turn-level notices in the thread. Slash commands are handled by side effects
 * (settings, mode toggles, etc.) and stay out of the message area; their raw
 * events remain visible in the Trajectory panel.
 */

import { AlertCircle, Info } from 'lucide-react'
import { Button, cn } from '@cocode/ui'
import type { NoticeNode } from '../../runtime/index.ts'
import { useActiveSession, useAutomation, useLayoutActions } from '../../shell/runtime-context.tsx'

export function NoticeRow({ node }: { node: NoticeNode }) {
  const automation = useAutomation()
  const layout = useLayoutActions()
  const session = useActiveSession()

  const onAction = () => {
    if (node.action?.kind !== 'open-automation') return
    if (session !== undefined) automation.focusSession(session.sessionId)
    layout.setCenterView('automation')
  }

  return (
    <div
      className={cn(
        'my-1.5 ml-[44px] flex items-start gap-2 rounded-md border px-3 py-2 text-[11px]',
        node.tone === 'error'
          ? 'border-[color-mix(in_srgb,var(--danger)_28%,var(--border))] bg-danger-soft text-danger'
          : 'border-border bg-surface-sunken text-muted-foreground',
      )}
    >
      {node.tone === 'error' ? <AlertCircle className="mt-px size-3.5 shrink-0" /> : <Info className="mt-px size-3.5 shrink-0" />}
      <span className="min-w-0 flex-1">{node.message}</span>
      {node.action === undefined
        ? null
        : (
            <Button size="sm" variant="ghost" className="shrink-0" onClick={onAction}>
              {node.action.label}
            </Button>
          )}
    </div>
  )
}
