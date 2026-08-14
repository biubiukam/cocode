/**
 * Header for non-conversation center surfaces.
 *
 * Mirrors the conversation header's dock controls so management pages stay
 * reachable without returning to a task first.
 */

import { PanelBottom, PanelLeft, PanelRight } from 'lucide-react'
import { IconButton, Tooltip } from '@cocode/ui'

export type CenterHeaderProps = {
  title: string
  /** When the sidebar column/drawer is hidden, the toggle lives in the center header. */
  showSidebarToggle: boolean
  sidebarOpen: boolean
  rightOpen: boolean
  bottomOpen: boolean
  onToggleSidebar(): void
  onToggleRight(): void
  onToggleBottom(): void
}

export function CenterHeader(props: CenterHeaderProps) {
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

      <h1 className="min-w-0 flex-1 truncate text-[13px] font-semibold tracking-[-0.01em]">{props.title}</h1>

      <Tooltip content="开合底部 Dock">
        <IconButton size="md" label="开合底部 Dock" aria-pressed={props.bottomOpen} aria-controls="dock-panel-bottom" onClick={props.onToggleBottom}>
          <PanelBottom />
        </IconButton>
      </Tooltip>
      <Tooltip content="开合右侧 Dock">
        <IconButton size="md" label="开合右侧 Dock" aria-pressed={props.rightOpen} aria-controls="dock-panel-right" onClick={props.onToggleRight}>
          <PanelRight />
        </IconButton>
      </Tooltip>
    </header>
  )
}
