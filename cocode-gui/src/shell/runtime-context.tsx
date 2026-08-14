/**
 * React binding to the GUI Cordis tree.
 *
 * Hooks read named services. There is no god-object grab bag.
 */

import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import { useStore } from 'zustand'
import type { ConnectionSnapshot, LayoutActions, LayoutStoreState, PluginSettingsSnapshot, SessionSnapshot, SessionStoreSnapshot } from '../runtime/index.ts'
import type { Session } from '../runtime/index.ts'
import type { HostBridge } from '../host/bridge.ts'
import type { ConnectionService } from '../runtime/connection/service.ts'
import type { SessionStore } from '../runtime/sessions/session-store.ts'
import type { LayoutService } from '../runtime/layout/service.ts'
import type { CommandCatalog } from '../runtime/commands/catalog.ts'
import type { PluginSettingsStore } from '../runtime/plugin-settings/store.ts'
import type { ShortcutRegistry } from '../runtime/shortcuts/registry.ts'
import type { FocusTracker } from '../runtime/focus/zones.ts'
import type { PanelRegistry } from '../runtime/panels/registry.ts'
import type { TerminalStore } from '../runtime/terminals/store.ts'
import type { AccountStore } from '../runtime/account/store.ts'
import type { OnboardingStore } from '../runtime/onboarding/store.ts'
import type { ProviderAvailabilityStore } from '../runtime/providers/store.ts'
import type { AutomationStore } from '../plugins/automation/store/store.ts'
import type { AutomationSnapshot } from '../plugins/automation/store/types.ts'

type CordisReactValue = {
  ctx: Context
  host: HostBridge
}

const CordisReactContext = createContext<CordisReactValue | undefined>(undefined)

export function CordisProvider({ ctx, host, children }: CordisReactValue & { children: ReactNode }) {
  const value = useMemo(() => ({ ctx, host }), [ctx, host])
  return <CordisReactContext.Provider value={value}>{children}</CordisReactContext.Provider>
}

function useCordis(): CordisReactValue {
  const value = useContext(CordisReactContext)
  if (value === undefined) throw new Error('useCordis must be used inside CordisProvider')
  return value
}

export function useGuiContext(): Context {
  return useCordis().ctx
}

export function useHost(): HostBridge {
  return useCordis().host
}

function useService<T>(name: string): T {
  const { ctx } = useCordis()
  const service = ctx.get(name as never) as T | undefined
  if (service === undefined) throw new Error(`service "${name}" is not available`)
  return service
}

export function useConnectionService(): ConnectionService {
  return useService('connection')
}

export function useSessions(): SessionStore {
  return useService('sessions')
}

export function useCommands(): CommandCatalog {
  return useService('commands')
}

export function usePluginSettingsStore(): PluginSettingsStore {
  return useService('pluginSettings')
}

export function useShortcuts(): ShortcutRegistry {
  return useService('shortcuts')
}

export function useFocus(): FocusTracker {
  return useService('focus')
}

export function usePanels(): PanelRegistry {
  return useService('panels')
}

export function useTerminals(): TerminalStore {
  return useService('terminals')
}

export function useAccountStore(): AccountStore {
  return useService('account')
}

export function useOnboarding(): OnboardingStore {
  return useService('onboarding')
}

export function useAutomation(): AutomationStore {
  return useService('automation')
}

export function useAutomationSnapshot(): AutomationSnapshot {
  const automation = useAutomation()
  return useSyncExternalStore(
    listener => automation.state.subscribe(listener),
    () => automation.state.get(),
  )
}

export function useProviders(): ProviderAvailabilityStore {
  return useService('providers')
}

export function useConnection(): ConnectionSnapshot {
  const connection = useConnectionService()
  return useSyncExternalStore(
    listener => connection.state.subscribe(listener),
    () => connection.state.get(),
  )
}

export function useSessionDirectory(): SessionStoreSnapshot {
  const sessions = useSessions()
  return useSyncExternalStore(
    listener => sessions.subscribe(listener),
    () => sessions.getSnapshot(),
  )
}

export function useActiveSession(): Session | undefined {
  const sessions = useSessions()
  const directory = useSessionDirectory()
  return directory.activeSessionId === undefined ? undefined : sessions.session(directory.activeSessionId)
}

export function useSessionSnapshot(session: Session | undefined): SessionSnapshot | undefined {
  const subscribe = useMemo(
    () => (listener: () => void) => (session === undefined ? () => {} : session.subscribe(listener)),
    [session],
  )
  return useSyncExternalStore(subscribe, () => session?.getSnapshot())
}

export function useLayout<T>(selector: (state: LayoutStoreState & LayoutActions) => T): T {
  const layout = useService<LayoutService>('layout')
  return useStore(layout.store, selector)
}

export function useLayoutService(): LayoutService {
  return useService<LayoutService>('layout')
}

export function useLayoutActions(): LayoutActions {
  return useService<LayoutService>('layout').store.getState()
}

export function useCommandCatalog(sessionId: string | undefined) {
  const commands = useCommands()
  useEffect(() => {
    if (sessionId === undefined) return
    void commands.load(sessionId)
  }, [commands, sessionId])
  return useSyncExternalStore(
    listener => commands.subscribe(listener),
    () => commands.get(sessionId),
  )
}

export function usePluginSettings(): PluginSettingsSnapshot {
  const pluginSettings = usePluginSettingsStore()
  return useSyncExternalStore(
    listener => pluginSettings.subscribe(listener),
    () => pluginSettings.getSnapshot(),
  )
}

export function useAccount() {
  const account = useAccountStore()
  return useSyncExternalStore(
    listener => account.state.subscribe(listener),
    () => account.state.get(),
  )
}

export function useFocusZone() {
  const focus = useFocus()
  return useSyncExternalStore(
    listener => focus.zone.subscribe(listener),
    () => focus.zone.get(),
  )
}

/** Subscribes to a typed Cordis event without exposing Context to the caller. */
export function useCordisEvent(name: string, handler: () => void): void {
  const { ctx } = useCordis()
  useEffect(() => {
    const dispose = ctx.on(name as never, handler as never)
    return () => { dispose() }
  }, [ctx, name, handler])
}

