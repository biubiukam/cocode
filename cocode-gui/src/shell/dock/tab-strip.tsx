/**
 * The Dock tab bar (design system §4.3 Dock tab variant, RFC §6.3).
 *
 * One implementation serves both docks. Tabs reorder within a dock and migrate
 * between docks through the same drag, which is the whole point of the two docks
 * being one capability: the user decides where a panel lives, not the code.
 */

import { useRef, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { IconButton, cn } from '@cocode/ui'
import type { DockId, DockTab, TabAddress } from '../../runtime/index.ts'
import { asPanelView } from '../../panels/types.ts'
import { usePanels } from '../runtime-context.tsx'
import { PanelPicker } from './panel-picker.tsx'

const DRAG_TYPE = 'application/x-cocode-dock-tab'

export type TabStripProps = {
  dock: DockId
  tabs: readonly DockTab[]
  activeIndex: number
  unread: Record<string, true>
  onActivate(index: number): void
  onClose(index: number): void
  onMove(from: TabAddress, to: TabAddress): void
  onOpenPanel(panelId: string): void
  onCloseDock(): void
}

/** Reads the drag payload; returns undefined for a drag that is not ours. */
function readDragged(event: React.DragEvent): TabAddress | undefined {
  const raw = event.dataTransfer.getData(DRAG_TYPE)
  if (raw === '') return undefined
  try {
    const parsed = JSON.parse(raw) as Partial<TabAddress>
    if ((parsed.dock !== 'right' && parsed.dock !== 'bottom') || typeof parsed.index !== 'number') return undefined
    return { dock: parsed.dock, index: parsed.index }
  }
  catch {
    return undefined
  }
}

export function TabStrip({
  dock, tabs, activeIndex, unread, onActivate, onClose, onMove, onOpenPanel, onCloseDock,
}: TabStripProps) {
  const panels = usePanels()
  const [dropIndex, setDropIndex] = useState<number | undefined>(undefined)
  const listRef = useRef<HTMLDivElement>(null)

  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      const next = event.key === 'ArrowRight'
        ? (index + 1) % tabs.length
        : (index - 1 + tabs.length) % tabs.length
      onActivate(next)
      const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
      buttons?.item(next)?.focus()
      event.preventDefault()
      return
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      onClose(index)
      event.preventDefault()
    }
  }

  return (
    <div className="flex h-[var(--dock-tabbar-height)] shrink-0 items-center gap-1 border-b border-border bg-surface pl-1 pr-1">
      <div
        ref={listRef}
        role="tablist"
        aria-label={dock === 'right' ? '右侧面板' : '底部面板'}
        aria-orientation="horizontal"
        className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto"
        onDragOver={event => {
          if (!event.dataTransfer.types.includes(DRAG_TYPE)) return
          event.preventDefault()
          setDropIndex(tabs.length)
        }}
        onDrop={event => {
          const from = readDragged(event)
          setDropIndex(undefined)
          if (from === undefined) return
          event.preventDefault()
          onMove(from, { dock, index: dropIndex ?? tabs.length })
        }}
      >
        {tabs.map((tab, index) => {
          const definition = asPanelView(panels.getView(tab.panelId))
          if (definition === undefined) return null
          const Icon = definition.icon
          const label = tab.instanceKey === null
            ? definition.title
            : definition.describe?.(definition.fromKey?.(tab.instanceKey)) ?? definition.title
          const selected = index === activeIndex
          const hasUnread = unread[`${dock}:${tab.panelId}:${tab.instanceKey ?? ''}`] === true

          return (
            <div key={`${tab.panelId}:${tab.instanceKey ?? ''}`} className="relative flex shrink-0 items-center">
              {dropIndex === index
                ? <span aria-hidden className="absolute -left-px top-1 h-[calc(100%-8px)] w-0.5 rounded-full bg-accent" />
                : null}
              <button
                role="tab"
                type="button"
                draggable
                aria-selected={selected}
                tabIndex={selected ? 0 : -1}
                id={`dock-tab-${dock}-${String(index)}`}
                aria-controls={`dock-panel-${dock}`}
                onClick={() => onActivate(index)}
                onKeyDown={event => handleKeyDown(event, index)}
                onDragStart={event => {
                  event.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ dock, index }))
                  event.dataTransfer.effectAllowed = 'move'
                }}
                onDragOver={event => {
                  if (!event.dataTransfer.types.includes(DRAG_TYPE)) return
                  event.preventDefault()
                  event.stopPropagation()
                  setDropIndex(index)
                }}
                onDragLeave={() => setDropIndex(undefined)}
                onDrop={event => {
                  const from = readDragged(event)
                  setDropIndex(undefined)
                  if (from === undefined) return
                  event.preventDefault()
                  event.stopPropagation()
                  onMove(from, { dock, index })
                }}
                className={cn(
                  'group relative flex min-h-[28px] items-center gap-1.5 rounded-sm px-2.5 text-[11px] font-semibold',
                  'transition-[background-color,color] duration-150',
                  selected ? 'text-foreground' : 'text-muted-foreground hover:bg-secondary',
                )}
              >
                {hasUnread && !selected
                  ? <span aria-label="有新内容" className="size-1.5 shrink-0 rounded-full bg-accent" />
                  : <Icon className="size-3.5 shrink-0" />}
                <span className="max-w-[150px] truncate">{label}</span>
                <span
                  role="button"
                  tabIndex={-1}
                  aria-label={`关闭 ${label}`}
                  onClick={event => {
                    event.stopPropagation()
                    onClose(index)
                  }}
                  className={cn(
                    'inline-flex size-3.5 items-center justify-center rounded-[4px] opacity-0',
                    'transition-opacity duration-150 hover:bg-secondary group-hover:opacity-100',
                    selected && 'opacity-100',
                  )}
                >
                  <X className="size-3" />
                </span>
                {selected
                  ? <span aria-hidden className="absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-foreground" />
                  : null}
              </button>
            </div>
          )
        })}
        {dropIndex === tabs.length && tabs.length > 0
          ? <span aria-hidden className="h-5 w-0.5 shrink-0 rounded-full bg-accent" />
          : null}
      </div>

      <PanelPicker onSelect={onOpenPanel}>
        <IconButton size="xs" label="打开面板"><Plus /></IconButton>
      </PanelPicker>
      <IconButton size="xs" label={dock === 'right' ? '关闭右侧 Dock' : '关闭底部 Dock'} onClick={onCloseDock}>
        <X />
      </IconButton>
    </div>
  )
}
