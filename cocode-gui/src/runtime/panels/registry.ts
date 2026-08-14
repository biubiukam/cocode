import { Service, type Context } from '@deepseek-ai/cordis'

/**
 * The panel registry (RFC §5.1).
 *
 * A Dock knows panel ids and nothing else. What the registry holds here is the
 * part the Dock actually reasons about — lifetime, multiplicity, default landing
 * spot, and how a target becomes a persistable instance key. Titles, icons, and
 * the React component live with the panel in the presentation layer, because the
 * runtime is React-free.
 */

export type DockId = 'right' | 'bottom'

/** How long a panel instance lives. */
export type PanelScope = 'workspace' | 'session'

export type PanelDescriptor = {
  /** Globally unique; also the key in the persisted layout. */
  id: string
  scope: PanelScope
  /** Whether several instances may coexist (Preview and Browser yes, Trajectory no). */
  multiInstance: boolean
  /** Where `open` lands the panel when the caller names no dock. */
  preferredDock: DockId
  /**
   * Serializes a target into the persisted instance key. Required for a
   * multi-instance panel: without it a second instance has no identity and the
   * persisted tab has nothing to restore from.
   */
  toKey?(target: unknown): string
  /** Rebuilds the target from a persisted instance key. */
  fromKey?(key: string): unknown
  /**
   * When `open` is called without a target, mint a fresh instance instead of
   * reusing one. Terminal uses this so every ⌃` is a new PTY.
   */
  mintInstance?(): unknown
}

export class PanelRegistry extends Service {
  private readonly panels = new Map<string, PanelDescriptor>()
  private readonly views = new Map<string, unknown>()

  constructor(ctx: Context) {
    super(ctx, 'panels')
  }

  /**
   * Registers Dock-facing metadata. Caller-fiber effect.
   * @param descriptor - lifetime, multiplicity, landing dock, instance keys.
   */
  register(descriptor: PanelDescriptor): () => void {
    return this.ctx.effect(() => this.add(descriptor), `panels.register(${descriptor.id})`)
  }

  /**
   * Registers the presentation half (title, icon, render) as `unknown`.
   * @param id - panel id.
   * @param view - presentation definition.
   */
  registerView(id: string, view: unknown): () => void {
    return this.ctx.effect(() => this.addView(id, view), `panels.registerView(${id})`)
  }

  add(descriptor: PanelDescriptor): () => void {
    if (this.panels.has(descriptor.id)) {
      throw new Error(`panel "${descriptor.id}" is already registered`)
    }
    if (descriptor.multiInstance && (descriptor.toKey === undefined || descriptor.fromKey === undefined)) {
      throw new Error(`multi-instance panel "${descriptor.id}" must define toKey and fromKey`)
    }
    this.panels.set(descriptor.id, descriptor)
    return () => { this.panels.delete(descriptor.id) }
  }

  addView(id: string, view: unknown): () => void {
    this.views.set(id, view)
    return () => { this.views.delete(id) }
  }

  getView(panelId: string): unknown {
    return this.views.get(panelId)
  }

  listViews(): readonly unknown[] {
    return [...this.views.values()]
  }

  get(panelId: string): PanelDescriptor | undefined {
    return this.panels.get(panelId)
  }

  has(panelId: string): boolean {
    return this.panels.has(panelId)
  }

  list(): readonly PanelDescriptor[] {
    return [...this.panels.values()]
  }

  /**
   * Computes the instance key for a target.
   * @param panelId - the panel being opened.
   * @param target - the opened object, if any.
   * @returns the instance key, or `null` for a single-instance panel.
   */
  instanceKey(panelId: string, target: unknown): string | null {
    const descriptor = this.panels.get(panelId)
    if (descriptor === undefined || !descriptor.multiInstance) return null
    return descriptor.toKey?.(target) ?? String(target)
  }

  /** Rebuilds a target from a persisted instance key. */
  target(panelId: string, instanceKey: string | null): unknown {
    if (instanceKey === null) return undefined
    return this.panels.get(panelId)?.fromKey?.(instanceKey)
  }
}

/** Registers Dock metadata and the presentation view in one plugin apply. */
export function registerPanelView(
  ctx: Context,
  descriptor: PanelDescriptor,
  view: unknown,
): void {
  ctx.panels.register(descriptor)
  ctx.panels.registerView(descriptor.id, view)
}

/** Presentation definitions carry the Dock half plus a React render function. */
export function registerDefinedPanel(ctx: Context, definition: unknown): void {
  const panel = definition as PanelDescriptor & { title: string }
  registerPanelView(ctx, {
    id: panel.id,
    scope: panel.scope,
    multiInstance: panel.multiInstance,
    preferredDock: panel.preferredDock,
    ...(panel.toKey === undefined ? {} : { toKey: panel.toKey }),
    ...(panel.fromKey === undefined ? {} : { fromKey: panel.fromKey }),
    ...(panel.mintInstance === undefined ? {} : { mintInstance: panel.mintInstance }),
  }, definition)
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    panels: PanelRegistry
  }
}
