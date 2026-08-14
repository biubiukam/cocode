/**
 * The conversation header (RFC §6.2).
 *
 * The two dock toggles on the right are the only permanently visible way back to a
 * closed dock. A handle hidden at the viewport edge would be smaller, but nobody
 * finds it; these cost no layout and read as controls.
 */

import { useState } from 'react'
import { Check, PanelLeft, Pencil, X } from 'lucide-react'
import { Badge, IconButton, Input, Tooltip } from '@cocode/ui'
import { SlotOutlet } from '../boot/slot-renderer.tsx'

export type SessionHeaderProps = {
  title: string | undefined
  cwd: string | undefined
  running: boolean
  /** When the sidebar column/drawer is hidden, the toggle lives in the center header. */
  showSidebarToggle: boolean
  sidebarOpen: boolean
  rightOpen: boolean
  bottomOpen: boolean
  onRename(title: string): void
  onToggleSidebar(): void
  onToggleRight(): void
  onToggleBottom(): void
}

export function SessionHeader(props: SessionHeaderProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const commit = () => {
    const trimmed = draft.trim()
    setEditing(false)
    if (trimmed !== '' && trimmed !== props.title) props.onRename(trimmed)
  }

  return (
    <header className="flex h-[var(--shell-header-height)] shrink-0 items-center gap-2 border-b border-border px-3">
      {props.showSidebarToggle
        ? (
            <Tooltip content="开合任务列表">
              <IconButton size="sm" label="开合任务列表" aria-pressed={props.sidebarOpen} onClick={props.onToggleSidebar}>
                <PanelLeft />
              </IconButton>
            </Tooltip>
          )
        : null}

      {editing
        ? (
            <div className="flex min-w-0 flex-1 items-center gap-1">
              <Input
                autoFocus
                value={draft}
                onChange={event => setDraft(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') commit()
                  if (event.key === 'Escape') setEditing(false)
                }}
                className="h-7 text-[13px]"
                aria-label="任务标题"
              />
              <IconButton size="xs" label="保存标题" onClick={commit}><Check /></IconButton>
              <IconButton size="xs" label="取消重命名" onClick={() => setEditing(false)}><X /></IconButton>
            </div>
          )
        : (
            <div className="group flex min-w-0 flex-1 items-center gap-2">
              <h1 className="min-w-0 truncate text-[13px] font-semibold tracking-[-0.01em]">
                {props.title ?? '新任务'}
              </h1>
              {props.running ? <Badge tone="accent">running</Badge> : null}
              <IconButton
                size="xs"
                label="重命名任务"
                className="opacity-0 group-hover:opacity-100"
                onClick={() => {
                  setDraft(props.title ?? '')
                  setEditing(true)
                }}
              >
                <Pencil />
              </IconButton>
              {props.cwd === undefined
                ? null
                : <span className="hidden truncate font-mono text-[10px] text-subtle-foreground lg:block">{props.cwd}</span>}
            </div>
          )}

      <SlotOutlet
        name="conversation.header.actions"
        owner={{
          rightOpen: props.rightOpen,
          bottomOpen: props.bottomOpen,
          onToggleRight: props.onToggleRight,
          onToggleBottom: props.onToggleBottom,
        }}
      />
    </header>
  )
}
