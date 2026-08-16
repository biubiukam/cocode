/**
 * Bottom-panel expansion tests. Expanding the panel must not create tabs;
 * terminals are created only by an explicit + menu action.
 *
 * These tests render the real Sidebar shell against a minimal fake context
 * (the repo's jsdom pattern) and drive the bottom panel through the store,
 * asserting the panel survives without creating an implicit terminal tab.
 */
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'

// The act() environment flag (React 18.2 reads it before flushing effects).
;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

import { Sidebar } from '../src/client/Sidebar.tsx'
import css from '../src/client/sidebar.module.css'
import { allLeaves, createSidebarStore, toggleBottomPanel, type SidebarStore } from '../src/client/state.ts'
import { createBetterSidebarService, type BetterSidebarService } from '../src/client/service.ts'
import { t } from '../src/client/locales.ts'

/** jsdom has no WebSocket; the agent-terminals push effect constructs one on mount. */
class FakeWebSocket {
  onmessage: ((event: { data: unknown }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  close = (): void => {}
  constructor(_url: string) {}
}

interface MountedSidebar {
  container: HTMLDivElement
  store: SidebarStore
  service: BetterSidebarService
  unmount: () => void
}

/** Mount the real Sidebar shell against a minimal context (real store + service). */
function mountSidebar(): MountedSidebar {
  vi.stubGlobal('WebSocket', FakeWebSocket)
  const container = document.createElement('div')
  document.body.append(container)
  const store = createSidebarStore()
  const service = createBetterSidebarService(store)
  // Keep the right panel open for this focused bottom-panel interaction test;
  // the product default for a fresh session is collapsed.
  store.setPrefs({ ...store.getPrefs(), openByDefault: true })
  store.setSession('s1')
  // useSyncExternalStore requires STABLE snapshots across calls (the real DSH
  // services return stable objects) — a fresh object per call loops forever.
  const localeSnapshot = { active: 'en' }
  const sessionsSnapshot = {
    current: 's1',
    // cwd present → api.sessionCwd is never called in these tests.
    byId: { s1: { cwd: '/tmp' } },
  }
  const ctx = {
    locale: { subscribe: () => () => {}, getSnapshot: () => localeSnapshot },
    sessions: { list: { subscribe: () => () => {}, getSnapshot: () => sessionsSnapshot } },
    betterSidebar: service,
  }
  const root: Root = createRoot(container)
  act(() => { root.render(createElement(Sidebar, { ctx: ctx as never, store })) })
  return {
    container,
    store,
    service,
    unmount: () => {
      act(() => { root.unmount() })
      container.remove()
    },
  }
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

/** Every tab currently living in the bottom workbench. */
function bottomTabs(store: SidebarStore): Array<{ type: string; title: string }> {
  const state = store.getSnapshot().state
  if (state === undefined) return []
  return allLeaves(state.bottomSplits).flatMap(leaf => leaf.tabs)
}

/** The stub terminal tab: counts renders so the test can see it actually mount. */
function registerStubTerminal(service: BetterSidebarService, renders: { count: number }): void {
  service.registerTab({
    id: 'terminal',
    title: () => 'Terminal',
    component: () => {
      renders.count += 1
      return createElement('div', null, 'terminal-stub-content')
    },
  })
}

describe('bottom-panel expansion', () => {
  it('measures a conversation slot that mounts later below the root wrapper', async () => {
    class FakeResizeObserver {
      constructor(_callback: ResizeObserverCallback) {}
      observe = (): void => {}
      disconnect = (): void => {}
    }
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)

    const rootHost = document.createElement('div')
    rootHost.id = 'root'
    document.body.append(rootHost)
    const { container, store } = mountSidebar()

    act(() => { store.reduce(toggleBottomPanel) })
    const close = container.querySelector(`[aria-label="${t('collapseBottomPanel')}"]`)
    expect(close).not.toBeNull()
    const bottomPanel = container.querySelector(`.${css.bottomPanel}`) as HTMLDivElement
    expect(bottomPanel).not.toBeNull()
    expect(bottomPanel.style.left).toBe('0px')
    expect(bottomPanel.style.right).toBe(`${window.innerWidth}px`)

    const frame = document.createElement('div')
    const center = document.createElement('div')
    const conversation = document.createElement('div')
    conversation.dataset.slot = 'conversation'
    center.append(conversation)
    frame.append(center)
    center.getBoundingClientRect = () => ({
      x: 240,
      y: 0,
      left: 240,
      top: 0,
      right: 900,
      bottom: 700,
      width: 660,
      height: 700,
      toJSON: () => ({}),
    })

    await act(async () => {
      rootHost.append(frame)
      await Promise.resolve()
    })

    expect(bottomPanel.style.left).toBe('240px')
    expect(bottomPanel.style.right).toBe(`${window.innerWidth - 900}px`)
  })

  it('does not auto-open a terminal tab on expansion', () => {
    const { container, store, service } = mountSidebar()
    const renders = { count: 0 }
    registerStubTerminal(service, renders)

    act(() => { store.reduce(toggleBottomPanel) })

    const state = store.getSnapshot().state!
    expect(state.bottomOpen).toBe(true)
    expect(state.bottomOpenedOnce).toBe(false)
    expect(bottomTabs(store)).toHaveLength(0)
    expect(renders.count).toBe(0)
    expect(container.textContent).not.toContain('terminal-stub-content')
    // The panel itself survived (the #42 symptom was a WHOLE blank panel):
    // the close control is present and the layout push for the bottom panel
    // height is live.
    expect(container.querySelector(`[aria-label="${t('collapseBottomPanel')}"]`)).not.toBeNull()
    expect(document.documentElement.style.getPropertyValue('--dsh-sidebar-height')).toBe(
      `${state.bottomHeight}px`,
    )
  })

  it('does not create a terminal on later expansions either', () => {
    const { store, service } = mountSidebar()
    registerStubTerminal(service, { count: 0 })

    act(() => { store.reduce(toggleBottomPanel) })
    expect(bottomTabs(store)).toHaveLength(0)

    // Collapse → expand again: no implicit terminal is created either time.
    act(() => { store.reduce(toggleBottomPanel) })
    expect(store.getSnapshot().state!.bottomOpen).toBe(false)
    act(() => { store.reduce(toggleBottomPanel) })
    expect(bottomTabs(store)).toHaveLength(0)
  })
})
