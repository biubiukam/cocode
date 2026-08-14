/**
 * A Dock instance (RFC §5.2).
 *
 * Both docks render this component. Everything that differs — stretch axis,
 * bounds, default panel — comes from `DOCK_CONFIG`, so there is exactly one place
 * where tab behaviour, empty state, keyboard handling, and panel hosting live.
 */

import { useEffect, useRef, useState } from 'react'
import { LayoutGrid } from 'lucide-react'
import { Button, EmptyState } from '@cocode/ui'
import {
  focusZoneAttribute,
  sizeClassOf,
  type DockId,
  type DockTab,
} from '../../runtime/index.ts'
import { asPanelView } from '../../panels/types.ts'
import { useLayout, useLayoutActions, usePanels } from '../runtime-context.tsx'
import { TabStrip } from './tab-strip.tsx'
import { PanelPicker } from './panel-picker.tsx'

/** Hosts one panel, feeding it the width class derived from its own container. */
function PanelHost({ dock, tab, index, active }: { dock: DockId; tab: DockTab; index: number; active: boolean }) {
  const actions = useLayoutActions()
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const element = containerRef.current
    if (element === null) return
    const observer = new ResizeObserver(entries => {
      const entry = entries[0]
      if (entry !== undefined) setWidth(entry.contentRect.width)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const definition = asPanelView(usePanels().getView(tab.panelId))
  if (definition === undefined) return null
  const target = tab.instanceKey === null ? undefined : definition.fromKey?.(tab.instanceKey)

  return (
    <div
      ref={containerRef}
      role="tabpanel"
      // Every tab stays mounted, so only the visible one may claim the id the
      // tab strip's `aria-controls` points at.
      id={active ? `dock-panel-${dock}` : undefined}
      aria-labelledby={`dock-tab-${dock}-${String(index)}`}
      hidden={!active}
      className="min-h-0 min-w-0 flex-1 overflow-hidden"
    >
      {definition.render({
        target,
        sizeClass: sizeClassOf(width),
        active,
        markUnread: () => actions.markUnread(dock, tab),
      })}
    </div>
  )
}

export function Dock({ dock }: { dock: DockId }) {
  const state = useLayout(layout => layout[dock])
  const unread = useLayout(layout => layout.unread)
  const actions = useLayoutActions()

  return (
    <section
      {...focusZoneAttribute(dock === 'right' ? 'dock:right' : 'dock:bottom')}
      aria-label={dock === 'right' ? '右侧面板区' : '底部面板区'}
      className="flex h-full min-h-0 min-w-0 flex-col bg-background"
    >
      <TabStrip
        dock={dock}
        tabs={state.tabs}
        activeIndex={state.activeIndex}
        unread={unread}
        onActivate={index => actions.activateTab(dock, index)}
        onClose={index => actions.closeTab(dock, index)}
        onMove={(from, to) => actions.moveTab(from, to)}
        onOpenPanel={panelId => actions.openPanel(panelId, { dock })}
        onCloseDock={() => actions.closeDock(dock)}
      />

      {state.tabs.length === 0
        ? (
            <div className="flex min-h-0 flex-1 items-center justify-center p-4">
              <EmptyState
                icon={LayoutGrid}
                title="这个区域还没有面板"
                description="面板是你主动查看的工作面：文件、预览、轨迹、作业。选一个放进来，它会记住位置。"
                action={(
                  <PanelPicker onSelect={panelId => actions.openPanel(panelId, { dock })}>
                    <Button size="sm" variant="secondary">选择面板</Button>
                  </PanelPicker>
                )}
              />
            </div>
          )
        : (
            // Every tab stays mounted: a panel that unmounts on tab switch loses its
            // scroll position and any in-flight work behind the user's back.
            state.tabs.map((tab, index) => (
              <PanelHost
                key={`${tab.panelId}:${tab.instanceKey ?? ''}`}
                dock={dock}
                tab={tab}
                index={index}
                active={index === state.activeIndex}
              />
            ))
          )}
    </section>
  )
}
