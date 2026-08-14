/**
 * Slot registry: the only UI composition surface.
 *
 * Semantics follow harness ui-slots (register / inject / keyed|list|single)
 * without the store/locale machinery. Registration is a caller-fiber effect.
 */

import { Service, type Context } from '@deepseek-ai/cordis'
import { Notifier } from '../notifier.ts'

export type SlotKind = 'single' | 'list' | 'keyed'
export type SlotScope = 'root' | 'session'

export type SlotSpec = {
  kind: SlotKind
  scope?: SlotScope
}

export type SlotEntry = {
  id: string
  name: string
  key?: string
  order: number
  component: unknown
  inject?: (owner: Record<string, unknown>) => Record<string, unknown>
}

export type SlotRegisterOptions = {
  name: string
  key?: string
  order?: number
  children?: Record<string, SlotSpec>
  inject?: (owner: Record<string, unknown>) => Record<string, unknown>
}

type SlotRecord = {
  spec: SlotSpec
  entries: SlotEntry[]
  version: number
}

let nextEntryId = 0

export class SlotService extends Service {
  private readonly records = new Map<string, SlotRecord>()
  private readonly notifier = new Notifier()
  private readonly keyNotifiers = new Map<string, Notifier>()

  constructor(ctx: Context) {
    super(ctx, 'slots')
    this.declare('root', { kind: 'single', scope: 'root' })
  }

  /**
   * Declares a slot hole. Parent registrations call this for `children`.
   * @param name - SlotMap key.
   * @param spec - kind and scope.
   */
  declare(name: string, spec: SlotSpec): void {
    const existing = this.records.get(name)
    if (existing !== undefined) {
      if (existing.spec.kind !== spec.kind) {
        throw new Error(`slot "${name}" already declared as ${existing.spec.kind}`)
      }
      return
    }
    this.records.set(name, { spec, entries: [], version: 0 })
  }

  /**
   * Registers a contribution. Must stay a prototype method so the service
   * proxy binds `this.ctx` to the caller's fiber.
   * @param options - target slot, optional keyed cell, children to declare.
   * @param component - render function stored as `unknown` (runtime is React-free).
   * @returns disposer collected by the caller's fiber.
   */
  register(options: SlotRegisterOptions, component: unknown): () => void {
    return this.ctx.effect(() => {
      this.declare(options.name, inferSpec(options))
      if (options.children !== undefined) {
        for (const [child, spec] of Object.entries(options.children)) {
          this.declare(child, spec)
        }
      }
      const record = this.records.get(options.name)
      if (record === undefined) throw new Error(`slot "${options.name}" is not declared`)
      const entry: SlotEntry = {
        id: `slot-${String(++nextEntryId)}`,
        name: options.name,
        key: options.key,
        order: options.order ?? 0,
        component,
        inject: options.inject,
      }
      record.entries = [...record.entries, entry].sort((left, right) => left.order - right.order)
      this.bump(options.name)
      return () => {
        const current = this.records.get(options.name)
        if (current === undefined) return
        current.entries = current.entries.filter(item => item.id !== entry.id)
        this.bump(options.name)
      }
    }, `slots.register(${options.name})`)
  }

  /**
   * Runs `callback` for the lifetime of a slot declaration.
   * @param name - declared slot key.
   * @param callback - effect body; its disposer runs when the declaration collapses.
   */
  inject(name: string, callback: () => (() => void) | void): () => void {
    return this.ctx.effect(() => {
      let active: (() => void) | undefined
      const reconcile = (): void => {
        const dispose = active
        active = undefined
        dispose?.()
        if (this.records.get(name) === undefined) return
        const result = callback()
        active = typeof result === 'function' ? result : undefined
      }
      const unsubscribe = this.subscribe(name, reconcile)
      reconcile()
      return () => {
        unsubscribe()
        active?.()
      }
    }, `slots.inject(${name})`)
  }

  spec(name: string): SlotSpec | undefined {
    return this.records.get(name)?.spec
  }

  entries(name: string): readonly SlotEntry[] {
    return this.records.get(name)?.entries ?? []
  }

  /**
   * Winners the renderer should paint: all list entries, the first single
   * entry, or every keyed entry (the outlet picks `owner.entryKey`).
   */
  entriesOfSlot(name: string): readonly SlotEntry[] {
    const record = this.records.get(name)
    if (record === undefined) return []
    if (record.spec.kind === 'single') return record.entries.slice(0, 1)
    return record.entries
  }

  subscribe(name: string, listener: () => void): () => void {
    const notifier = this.keyNotifiers.get(name) ?? new Notifier()
    this.keyNotifiers.set(name, notifier)
    return notifier.subscribe(listener)
  }

  getVersion(name: string): number {
    return this.records.get(name)?.version ?? 0
  }

  /** Session-scoped slot records have no persisted stores in this renderer. */
  pruneStoreScope(_sessionId: string): void {}

  private bump(name: string): void {
    const record = this.records.get(name)
    if (record === undefined) return
    record.version += 1
    this.keyNotifiers.get(name)?.markDirty()
    this.notifier.markDirty()
    this.ctx.emit('slots/changed', name)
  }
}

function inferSpec(options: SlotRegisterOptions): SlotSpec {
  if (options.key !== undefined) return { kind: 'keyed', scope: 'root' }
  if (options.name === 'root') return { kind: 'single', scope: 'root' }
  return { kind: 'list', scope: 'root' }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    slots: SlotService
  }
  interface Events {
    'slots/changed'(key: string): void
  }
}
