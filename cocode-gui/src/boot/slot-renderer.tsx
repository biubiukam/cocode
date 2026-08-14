/**
 * React face of the slot registry. Components receive owner + inject props
 * and `renderSlot`; they never import Context.
 */

import { createContext, useContext, useMemo, useSyncExternalStore, type ComponentType, type ReactNode } from 'react'
import type { SlotEntry, SlotService } from '../runtime/slots/service.ts'

export type SlotOwner = Record<string, unknown> & { entryKey?: string }

export type SlotRenderProps = SlotOwner & {
  renderSlot(name: string, owner?: SlotOwner): ReactNode
}

const SlotsReactContext = createContext<SlotService | undefined>(undefined)

export function SlotsProvider({ slots, children }: { slots: SlotService; children: ReactNode }) {
  return <SlotsReactContext.Provider value={slots}>{children}</SlotsReactContext.Provider>
}

export function useSlots(): SlotService {
  const slots = useContext(SlotsReactContext)
  if (slots === undefined) throw new Error('useSlots must be used inside SlotsProvider')
  return slots
}

export function useSlotEntries(name: string): readonly SlotEntry[] {
  const slots = useSlots()
  return useSyncExternalStore(
    listener => slots.subscribe(name, listener),
    () => slots.entriesOfSlot(name),
  )
}

export type SlotContribution<T extends Record<string, unknown> = Record<string, unknown>> = T & {
  entryId: string
  component: ComponentType<SlotRenderProps>
}

/** Reads inject() data for a list slot (palette items, settings sections). */
export function useSlotContributions<T extends Record<string, unknown>>(name: string): readonly SlotContribution<T>[] {
  const entries = useSlotEntries(name)
  return entries.map(entry => ({
    ...(entry.inject?.({}) ?? {}),
    entryId: entry.id,
    component: entry.component as ComponentType<SlotRenderProps>,
  })) as SlotContribution<T>[]
}

export function renderSlotTree(slots: SlotService, name: string, owner: SlotOwner = {}): ReactNode {
  const spec = slots.spec(name)
  let entries = slots.entriesOfSlot(name)
  if (spec?.kind === 'keyed') {
    const key = typeof owner.entryKey === 'string' ? owner.entryKey : undefined
    const matched = entries.filter(entry => entry.key === key)
    entries = matched.length > 0
      ? matched
      : name === 'center.view'
        ? entries.filter(entry => entry.key === 'conversation')
        : []
  }
  const next = (child: string, childOwner: SlotOwner = {}): ReactNode => renderSlotTree(slots, child, childOwner)
  return entries.map(entry => {
    const extra = entry.inject?.(owner) ?? {}
    const Component = entry.component as ComponentType<SlotRenderProps>
    return <Component key={entry.id} {...owner} {...extra} renderSlot={next} />
  })
}

export function SlotOutlet({ name, owner }: { name: string; owner?: SlotOwner }) {
  const slots = useSlots()
  const version = useSyncExternalStore(
    listener => slots.subscribe(name, listener),
    () => slots.getVersion(name),
  )
  return useMemo(
    () => renderSlotTree(slots, name, owner ?? {}),
    [slots, name, owner, version],
  )
}
