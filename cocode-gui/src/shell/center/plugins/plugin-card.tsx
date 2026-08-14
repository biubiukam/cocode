/**
 * Accordion chrome for one host-plane plugin card.
 *
 * Disclosure is local reading state. Staged edits outlive collapse, so the
 * header marks a dirty card even while it is closed.
 */

import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { Badge, Button, cn } from '@cocode/ui'

export type PluginCardShell = {
  writable: boolean
  dirty: boolean
  invalid: boolean
  saving: boolean
  failed: boolean
}

export function PluginCard({
  title,
  description,
  state,
  open,
  onToggle,
  onSave,
  onDiscard,
  children,
}: {
  title: string
  description: string
  state: PluginCardShell
  open: boolean
  onToggle(): void
  onSave(): void
  onDiscard(): void
  children: ReactNode
}) {
  const blocked = !state.dirty || state.invalid || state.saving || !state.writable
  return (
    <li className="rounded-lg border border-border bg-surface-raised">
      <button
        type="button"
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
        aria-expanded={open}
        aria-label={`${open ? '收起设置' : '展开设置'}: ${title}`}
        onClick={onToggle}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-medium text-foreground">{title}</span>
          <span className="mt-0.5 block text-[12px] leading-[1.45] text-muted-foreground">{description}</span>
        </span>
        {state.dirty ? <Badge>未保存</Badge> : null}
        <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open
        ? (
            <div className="border-t border-border px-4 py-3">
              {state.writable
                ? null
                : <p className="mb-3 text-[12px] text-muted-foreground" role="status">本部署的设置为只读。</p>}
              <div>{children}</div>
              {state.failed
                ? <p className="mt-3 text-[12px] text-danger" role="status">本部署没有接受这些值，已保留供你修改。</p>
                : null}
              <div className="mt-4 flex justify-end gap-2">
                <Button size="sm" variant="ghost" disabled={!state.dirty || state.saving} onClick={onDiscard}>
                  放弃修改
                </Button>
                <Button size="sm" variant="primary" disabled={blocked} onClick={onSave}>
                  {state.saving ? '保存中…' : '保存'}
                </Button>
              </div>
            </div>
          )
        : null}
    </li>
  )
}
