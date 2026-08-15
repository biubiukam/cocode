import {
  DEFAULT_SHORTCUT_SETTINGS,
  type ShortcutSettings,
  type ShortcutSettingsView,
  type UserBinding,
} from "../settings.ts"
import {
  ShortcutSettingsApiError,
  shortcutSettingsTransport,
  type ShortcutSettingsTransport,
} from "./settings-api.ts"

export type ShortcutSettingsControllerStatus = "loading" | "ready" | "memory"

export type ShortcutSettingsControllerSnapshot = {
  readonly value: ShortcutSettings
  readonly status: ShortcutSettingsControllerStatus
  readonly writable: boolean
  readonly revision?: number
  readonly error?: string
}

type FocusTarget = {
  addEventListener(type: "focus", listener: () => void): void
  removeEventListener(type: "focus", listener: () => void): void
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function normalizeBinding(value: unknown): UserBinding | undefined {
  if (!isRecord(value)) return undefined
  const binding: {
    combo?: NonNullable<UserBinding["combo"]>
    scope?: "app" | "global"
    disabled?: boolean
  } = {}
  if (value.combo !== undefined) {
    if (!isRecord(value.combo) || typeof value.combo.key !== "string" || value.combo.key === "") {
      return undefined
    }
    const combo: {
      key: string
      primary?: boolean
      alt?: boolean
      shift?: boolean
      control?: boolean
    } = { key: value.combo.key }
    for (const key of ["primary", "alt", "shift", "control"] as const) {
      const candidate = value.combo[key]
      if (candidate === undefined) continue
      if (typeof candidate !== "boolean") return undefined
      combo[key] = candidate
    }
    binding.combo = combo
  }
  if (value.scope !== undefined) {
    if (value.scope !== "app" && value.scope !== "global") return undefined
    binding.scope = value.scope
  }
  if (value.disabled !== undefined) {
    if (typeof value.disabled !== "boolean") return undefined
    binding.disabled = value.disabled
  }
  return binding
}

function normalizeSettingsView(value: ShortcutSettingsView): ShortcutSettingsView {
  if (!isRecord(value) || !isRecord(value.value) || value.value.version !== 1) {
    throw new ShortcutSettingsApiError("invalid-response", "invalid shortcut settings response")
  }
  if (!isRecord(value.value.bindings)) {
    throw new ShortcutSettingsApiError("invalid-response", "invalid shortcut bindings response")
  }
  const bindings: Record<string, UserBinding> = {}
  for (const [commandId, binding] of Object.entries(value.value.bindings)) {
    const normalized = normalizeBinding(binding)
    if (normalized === undefined) {
      throw new ShortcutSettingsApiError(
        "invalid-response",
        "invalid shortcut binding for " + commandId,
      )
    }
    bindings[commandId] = normalized
  }
  if (!Number.isInteger(value.revision) || value.revision < 0 || typeof value.writable !== "boolean") {
    throw new ShortcutSettingsApiError("invalid-response", "invalid shortcut settings metadata")
  }
  return {
    value: { version: 1, bindings },
    ...(value.user === undefined ? {} : { user: value.user }),
    ...(value.base === undefined ? {} : { base: value.base }),
    revision: value.revision,
    writable: value.writable,
  }
}

/** Owns shortcut settings loading, revision-fenced writes, and memory fallback. */
export class ShortcutSettingsController {
  private readonly listeners = new Set<() => void>()
  private snapshot: ShortcutSettingsControllerSnapshot = {
    value: structuredClone(DEFAULT_SHORTCUT_SETTINGS),
    status: "loading",
    writable: false,
  }
  private focusTarget: FocusTarget | undefined
  private generation = 0
  private disposed = false
  private hasRemoteState = false

  constructor(
    private readonly transport: ShortcutSettingsTransport = shortcutSettingsTransport,
  ) {}

  getSnapshot = (): ShortcutSettingsControllerSnapshot => this.snapshot

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  mount(target: FocusTarget = window): void {
    if (this.disposed || this.focusTarget !== undefined) return
    this.focusTarget = target
    target.addEventListener("focus", this.onFocus)
    void this.reload()
  }

  async reload(): Promise<void> {
    if (this.disposed) return
    const generation = ++this.generation
    try {
      const view = normalizeSettingsView(await this.transport.get())
      if (this.disposed || generation !== this.generation) return
      this.hasRemoteState = true
      this.publish({
        value: view.value,
        status: "ready",
        writable: view.writable,
        revision: view.revision,
      })
    } catch (error) {
      if (this.disposed || generation !== this.generation) return
      const message = error instanceof Error ? error.message : String(error)
      if (!this.hasRemoteState) {
        this.publish({
          value: this.snapshot.value,
          status: "memory",
          writable: true,
          error: message,
        })
        return
      }
      this.publish({ ...this.snapshot, error: message })
    }
  }

  async setBindings(bindings: Record<string, UserBinding>): Promise<void> {
    if (this.disposed) return
    const nextValue: ShortcutSettings = {
      version: 1,
      bindings: structuredClone(bindings),
    }
    if (this.snapshot.status === "memory") {
      this.publish({
        value: nextValue,
        status: "memory",
        writable: true,
        ...(this.snapshot.error === undefined ? {} : { error: this.snapshot.error }),
      })
      return
    }
    if (!this.snapshot.writable || this.snapshot.revision === undefined) return
    const generation = ++this.generation
    try {
      const view = normalizeSettingsView(await this.transport.update(
        nextValue,
        this.snapshot.revision,
      ))
      if (this.disposed || generation !== this.generation) return
      this.hasRemoteState = true
      this.publish({
        value: view.value,
        status: "ready",
        writable: view.writable,
        revision: view.revision,
      })
    } catch (error) {
      if (this.disposed || generation !== this.generation) return
      const message = error instanceof Error ? error.message : String(error)
      this.publish({ ...this.snapshot, error: message })
      if (error instanceof ShortcutSettingsApiError && error.code === "settings-conflict") {
        await this.reload()
      }
    }
  }

  async resetBinding(commandId: string): Promise<void> {
    const bindings = { ...this.snapshot.value.bindings }
    delete bindings[commandId]
    await this.setBindings(bindings)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.generation += 1
    this.focusTarget?.removeEventListener("focus", this.onFocus)
    this.focusTarget = undefined
    this.listeners.clear()
  }

  private readonly onFocus = (): void => {
    void this.reload()
  }

  private publish(snapshot: ShortcutSettingsControllerSnapshot): void {
    this.snapshot = snapshot
    for (const listener of [...this.listeners]) listener()
  }
}
