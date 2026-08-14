/**
 * The four-zone shell (RFC §3).
 *
 * The sidebar and the right dock are full-height columns; the bottom dock sits
 * between them, aligned to the conversation column. The bottom dock never eats
 * into the right dock, and the right dock's height never changes when the bottom
 * one opens — a long file tree should not lose half its view because a terminal
 * appeared.
 *
 * The consequence is deliberate: the bottom dock's available width changes with
 * the right dock, so its panels move between size classes. That is exactly why a
 * panel is never told how wide it is (§5.1).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@cocode/ui'
import {
  CONVERSATION_MIN_WIDTH,
  DOCK_CONFIG,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  focusZoneAttribute,
} from '../runtime/index.ts'
import type { HarnessEndpointInfo } from '../host/bridge.ts'
import { SlotOutlet } from '../boot/slot-renderer.tsx'
import { Sidebar } from './sidebar/sidebar.tsx'
import { Dock } from './dock/dock.tsx'
import { Splitter } from './splitter.tsx'
import { CenterContent } from './center/center-content.tsx'
import { CommandPalette } from './overlay/command-palette.tsx'
import { SettingsDialog } from './sidebar/settings-dialog.tsx'
import { useConnection, useCordisEvent, useFocus, useLayout, useLayoutActions } from './runtime-context.tsx'
import { useShellShortcuts } from './shortcuts.tsx'

export function AppFrame({ endpoint }: { endpoint?: HarnessEndpointInfo }) {
  const connection = useConnection()
  const actions = useLayoutActions()
  const rootRef = useRef<HTMLDivElement>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [everReady, setEverReady] = useState(false)

  const sidebar = useLayout(state => state.sidebar)
  const right = useLayout(state => state.right)
  const bottom = useLayout(state => state.bottom)
  const rightOverlay = useLayout(state => state.rightOverlay)
  const sidebarDrawer = useLayout(state => state.sidebarDrawer)
  const sidebarDrawerOpen = useLayout(state => state.sidebarDrawerOpen)
  const viewportWidth = useLayout(state => state.viewportWidth)
  const viewportHeight = useLayout(state => state.viewportHeight)

  useShellShortcuts()
  useCordisEvent('shell/open-palette', useCallback(() => setPaletteOpen(open => !open), []))
  useCordisEvent('shell/open-settings', useCallback(() => setSettingsOpen(true), []))

  useEffect(() => {
    if (connection.phase === 'ready') setEverReady(true)
  }, [connection.phase])

  const focus = useFocus()
  useEffect(() => {
    const element = rootRef.current
    if (element === null) return
    return focus.attach(element)
  }, [focus])

  useEffect(() => {
    const update = () => actions.setViewport(globalThis.innerWidth, globalThis.innerHeight)
    update()
    globalThis.addEventListener('resize', update)
    return () => globalThis.removeEventListener('resize', update)
  }, [actions])

  const sidebarWidth = sidebarDrawer ? 0 : sidebar
  const rightWidth = rightOverlay ? 0 : right.size
  const bottomHeight = bottom.size

  return (
    <div ref={rootRef} className="relative flex h-full w-full flex-col overflow-hidden">
      <SlotOutlet name="shell.overlay" owner={{ endpoint, everReady }} />

      <div className={cn('flex min-h-0 flex-1 flex-col', everReady ? '' : 'hidden')}>
        <div
          className="relative grid min-h-0 flex-1"
          style={{
            gridTemplateColumns: `${String(sidebarWidth)}px minmax(0,1fr) ${String(rightWidth)}px`,
            gridTemplateRows: `minmax(0,1fr) ${String(bottomHeight)}px`,
          }}
        >
          {/* A closed or overlaying region is not rendered at all. Hiding it with
              CSS would leave a second copy of the dock's tab and panel ids in the
              document, which breaks `aria-controls` and duplicates focus targets. */}
          {sidebarWidth === 0
            ? null
            : (
                <div style={{ gridArea: '1 / 1 / 3 / 2' }} className="min-w-0 overflow-hidden">
                  <Sidebar onOpenSettings={() => setSettingsOpen(true)} />
                </div>
              )}

          <div style={{ gridArea: '1 / 2 / 2 / 3' }} className="min-h-0 min-w-0 overflow-hidden">
            <CenterContent />
          </div>

          {bottomHeight === 0
            ? null
            : (
                <div style={{ gridArea: '2 / 2 / 3 / 3' }} className="min-h-0 min-w-0 overflow-hidden border-t border-border">
                  <Dock dock="bottom" />
                </div>
              )}

          {rightWidth === 0
            ? null
            : (
                <div style={{ gridArea: '1 / 3 / 3 / 4' }} className="min-h-0 min-w-0 overflow-hidden border-l border-border">
                  <Dock dock="right" />
                </div>
              )}

          {sidebarWidth === 0
            ? null
            : (
                <Splitter
                  orientation="vertical"
                  value={sidebar}
                  min={SIDEBAR_MIN_WIDTH}
                  max={SIDEBAR_MAX_WIDTH}
                  direction={1}
                  label="调整任务列表宽度"
                  onChange={actions.setSidebarWidth}
                  onReset={actions.toggleSidebar}
                  className="absolute inset-y-0"
                  style={{ left: sidebarWidth }}
                />
              )}

          {rightWidth === 0
            ? null
            : (
                <Splitter
                  orientation="vertical"
                  value={right.size}
                  min={DOCK_CONFIG.right.minSize}
                  max={Math.round(viewportWidth * DOCK_CONFIG.right.maxFraction)}
                  direction={-1}
                  label="调整右侧 Dock 宽度"
                  onChange={size => actions.setDockSize('right', size)}
                  onReset={() => actions.resetDockSize('right')}
                  className="absolute inset-y-0"
                  style={{ right: rightWidth }}
                />
              )}

          {bottomHeight === 0
            ? null
            : (
                <Splitter
                  orientation="horizontal"
                  value={bottom.size}
                  min={DOCK_CONFIG.bottom.minSize}
                  max={Math.round(viewportHeight * DOCK_CONFIG.bottom.maxFraction)}
                  direction={-1}
                  label="调整底部 Dock 高度"
                  onChange={size => actions.setDockSize('bottom', size)}
                  onReset={() => actions.resetDockSize('bottom')}
                  className="absolute"
                  style={{ bottom: bottomHeight, left: sidebarWidth, right: rightWidth }}
                />
              )}
        </div>
      </div>

      {sidebarDrawer && sidebarDrawerOpen
        ? (
            <>
              <button
                type="button"
                aria-label="关闭任务列表"
                className="fixed inset-0 z-40 bg-[var(--overlay-scrim)]"
                onClick={() => actions.setSidebarDrawerOpen(false)}
              />
              <div className="fixed inset-y-0 left-0 z-40 w-[min(280px,80vw)] shadow-md">
                <Sidebar onOpenSettings={() => setSettingsOpen(true)} />
              </div>
            </>
          )
        : null}

      {rightOverlay && right.size > 0
        ? (
            <>
              <button
                type="button"
                aria-label="关闭右侧 Dock"
                className="fixed inset-0 z-40 bg-[var(--overlay-scrim)]"
                onClick={() => actions.closeDock('right')}
              />
              <div
                {...focusZoneAttribute('dock:right')}
                className="fixed inset-y-0 right-0 z-40 border-l border-border bg-background shadow-md"
                style={{ width: Math.min(right.size, Math.max(CONVERSATION_MIN_WIDTH, viewportWidth - 48)) }}
              >
                <Dock dock="right" />
              </div>
            </>
          )
        : null}

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  )
}
