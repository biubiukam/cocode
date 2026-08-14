/**
 * The tool call card (design system §5.3 / §5.4, with the §6.3 inline approval).
 *
 * The card is a record of what happened. When its content is also something the
 * user might want to keep looking at, it offers an explicit "open in panel" —
 * clicked, never automatic. Nothing the Agent does may take over a panel the user
 * is currently reading (RFC §5.5).
 */

import { useState } from 'react'
import {
  AlertTriangle, Check, ChevronDown, ChevronRight, Clock, ExternalLink, Terminal, Wrench, X,
} from 'lucide-react'
import { Badge, Button, Spinner, cn } from '@cocode/ui'
import type { ToolNode } from '../../runtime/index.ts'
import { useLayoutActions } from '../../shell/runtime-context.tsx'
import { SlotOutlet } from '../../boot/slot-renderer.tsx'
import type { PreviewTarget } from '../../panels/preview/index.tsx'

const STATUS_BORDER: Record<ToolNode['status'], string> = {
  'running': 'border-[color-mix(in_srgb,var(--accent)_28%,var(--border))]',
  'awaiting-approval': 'border-[color-mix(in_srgb,var(--warning)_30%,var(--border))]',
  'success': 'border-border',
  'error': 'border-[color-mix(in_srgb,var(--danger)_30%,var(--border))]',
}

function StatusMark({ status }: { status: ToolNode['status'] }) {
  if (status === 'running') return <Spinner className="size-5" />
  if (status === 'awaiting-approval') return <Clock className="size-5 text-warning" />
  if (status === 'error') return <X className="size-5 text-danger" />
  return <Check className="size-5 text-success" />
}

/** A short, always-visible description of the call for the card header. */
function headerTitle(node: ToolNode): string {
  const view = node.callView
  if (view !== undefined) return view.title
  return node.name
}

/** What, if anything, this call produced that is worth a dedicated panel. */
function previewTarget(node: ToolNode): PreviewTarget | undefined {
  const result = node.resultView
  if (result?.card === 'diff') {
    const first = result.diffs[0]
    return first === undefined ? undefined : { kind: 'diff', callId: node.callId, path: first.path }
  }
  if (result?.card === 'read') return { kind: 'read', callId: node.callId, path: result.path }
  if (node.callView?.card === 'diff') {
    const first = node.callView.diffs[0]
    return first === undefined ? undefined : { kind: 'diff', callId: node.callId, path: first.path }
  }
  return undefined
}

function ToolBody({ node }: { node: ToolNode }) {
  const card = node.resultView?.card ?? node.callView?.card ?? 'generic'
  return <SlotOutlet name="conversation.tool.view" owner={{ entryKey: card, node }} />
}

export type ToolCardProps = {
  node: ToolNode
  onApprove(approvalId: string): void
  onReject(approvalId: string): void
}

export function ToolCard({ node, onApprove, onReject }: ToolCardProps) {
  const [expanded, setExpanded] = useState(false)
  const actions = useLayoutActions()
  const target = previewTarget(node)
  const isTerminal = node.callView?.card === 'terminal'
  const subtitle = node.callView?.card === 'terminal' ? node.callView.description : undefined

  return (
    <div className="cocode-rise py-2 pl-[44px]">
      {subtitle === undefined ? null : <p className="mb-1 text-[11px] text-muted-foreground">{subtitle}</p>}
      <div className={cn('overflow-hidden rounded-md border bg-surface-sunken', STATUS_BORDER[node.status])}>
        <div className="flex min-h-[40px] items-center gap-2 px-2.5">
          <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-[7px] bg-background text-accent-ink">
            {isTerminal ? <Terminal className="size-3.5" /> : <Wrench className="size-3.5" />}
          </span>
          <button
            type="button"
            onClick={() => setExpanded(open => !open)}
            aria-expanded={expanded}
            className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
          >
            {expanded ? <ChevronDown className="size-3 shrink-0 text-muted-foreground" /> : <ChevronRight className="size-3 shrink-0 text-muted-foreground" />}
            <span className="truncate text-[13px] font-medium text-foreground">{headerTitle(node)}</span>
            <span className="truncate font-mono text-[10px] text-muted-foreground">{node.name}</span>
          </button>
          {target === undefined
            ? null
            : (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => actions.openPanel('preview', { target })}
                >
                  <ExternalLink />
                  在面板中打开
                </Button>
              )}
          <StatusMark status={node.status} />
        </div>

        {node.approval === undefined
          ? null
          : (
              <div className="flex items-start gap-2 border-t border-[color-mix(in_srgb,var(--warning)_30%,var(--border))] bg-warning-soft px-2.5 py-2">
                <AlertTriangle className="mt-0.5 size-[18px] shrink-0 text-warning" />
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-semibold text-foreground">需要你的许可才能执行 {node.approval.toolName}</p>
                  <p className="text-[11px] text-muted-foreground">{node.approval.reason ?? '该工具调用超出了当前的自动放行范围。'}</p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Button size="sm" variant="primary" onClick={() => onApprove(node.approval?.approvalId ?? '')}>允许一次</Button>
                  <Button size="sm" variant="secondary" onClick={() => onReject(node.approval?.approvalId ?? '')}>拒绝</Button>
                </div>
              </div>
            )}

        {node.error === undefined
          ? null
          : (
              <p className="border-t border-border px-2.5 py-1.5 text-[11px] text-danger">
                {node.error.name} · {node.error.code}
              </p>
            )}

        {expanded
          ? <div className="border-t border-border p-2.5"><ToolBody node={node} /></div>
          : null}
      </div>
      {node.finishedAt === undefined || !expanded
        ? null
        : (
            <p className="mt-1 font-mono text-[10px] text-subtle-foreground">
              耗时 {Math.max(0, Math.round((node.finishedAt - node.time) / 100) / 10)}s
            </p>
          )}
    </div>
  )
}

export function ToolStatusBadge({ status }: { status: ToolNode['status'] }) {
  const tone = status === 'error' ? 'danger' : status === 'awaiting-approval' ? 'warning' : status === 'running' ? 'accent' : 'success'
  const label = status === 'error' ? '失败' : status === 'awaiting-approval' ? '待审批' : status === 'running' ? '运行中' : '完成'
  return <Badge tone={tone}>{label}</Badge>
}
