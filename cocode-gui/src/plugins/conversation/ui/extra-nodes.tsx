import { AlertCircle, Info, Terminal } from 'lucide-react'
import { cn } from '@cocode/ui'
import type { CommandNode, FallbackNode } from '../../../runtime/index.ts'

export function CommandRow({ node }: { node: CommandNode }) {
  return (
    <div
      className={cn(
        'my-1.5 ml-[44px] flex items-start gap-2 rounded-md border px-3 py-2 text-[11px]',
        node.status === 'error'
          ? 'border-[color-mix(in_srgb,var(--danger)_28%,var(--border))] bg-danger-soft text-danger'
          : 'border-border bg-surface-sunken text-muted-foreground',
      )}
    >
      <Terminal className="mt-px size-3.5 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="font-mono">/{node.name}</span>
        {node.args === undefined || node.args === '' ? null : <span className="ml-1">{node.args}</span>}
        {node.text === undefined || node.text === '' ? null : <span className="ml-2">{node.text}</span>}
      </span>
    </div>
  )
}

export function FallbackRow({ node }: { node: FallbackNode }) {
  return (
    <div className="my-1.5 ml-[44px] flex items-start gap-2 rounded-md border border-border bg-surface-sunken px-3 py-2 text-[11px] text-subtle-foreground">
      {node.eventType.includes('error') ? <AlertCircle className="mt-px size-3.5 shrink-0" /> : <Info className="mt-px size-3.5 shrink-0" />}
      <span className="min-w-0 flex-1 font-mono">{node.eventType}</span>
    </div>
  )
}
