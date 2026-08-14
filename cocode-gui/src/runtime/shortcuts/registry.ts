/**
 * Shell shortcuts. Plugins register bindings; there is no closed id union.
 */

import { Service, type Context } from '@deepseek-ai/cordis'

export type Combo = {
  /** `KeyboardEvent.key`, lower-cased. */
  key: string
  /** The platform's primary modifier: Command on macOS, Control elsewhere. */
  primary?: boolean
  alt?: boolean
  shift?: boolean
  /** Literal Control, independent of the primary modifier. */
  control?: boolean
}

export type ShortcutDefinition = {
  id: string
  description: string
  combo: Combo
  /** Extra combinations that fire the same action on the desktop carrier. */
  aliases?: readonly Combo[]
  /**
   * Replacement for a combination the browser reserves. `false` means the
   * shortcut is unbound there — we do not register a handler that never fires.
   */
  browserCombo?: Combo | false
  /** Runs when the binding matches. Return false to leave the event unconsumed. */
  run(): boolean
  /**
   * When false, a text-entry target keeps the key (unless it is inside xterm).
   * Modified shell combinations stay true by default.
   */
  allowInTextEntry?: boolean
}

const isApple = /Mac|iPhone|iPad/i.test(globalThis.navigator?.userAgent ?? '')

/** Whether the event carries the platform's primary modifier. */
function hasPrimary(event: KeyboardEvent): boolean {
  return isApple ? event.metaKey : event.ctrlKey
}

function comboMatches(combo: Combo, event: KeyboardEvent): boolean {
  if (event.key.toLowerCase() !== combo.key) return false
  if (hasPrimary(event) !== (combo.primary ?? false)) return false
  if (event.altKey !== (combo.alt ?? false)) return false
  if (event.shiftKey !== (combo.shift ?? false)) return false
  const literalControl = isApple ? event.ctrlKey : event.ctrlKey && !(combo.primary ?? false)
  return literalControl === (combo.control ?? false)
}

/** Renders one combination the way the current platform writes it. */
export function formatCombo(combo: Combo): string {
  const parts: string[] = []
  if (combo.control) parts.push(isApple ? '⌃' : 'Ctrl')
  if (combo.alt) parts.push(isApple ? '⌥' : 'Alt')
  if (combo.shift) parts.push(isApple ? '⇧' : 'Shift')
  if (combo.primary) parts.push(isApple ? '⌘' : 'Ctrl')
  parts.push(combo.key === '`' ? '`' : combo.key.toUpperCase())
  return isApple ? parts.join('') : parts.join('+')
}

export class ShortcutRegistry extends Service {
  private readonly definitions: ShortcutDefinition[] = []

  constructor(ctx: Context, private readonly platform: 'electron' | 'browser') {
    super(ctx, 'shortcuts')
  }

  /**
   * Registers one binding. Caller-fiber effect.
   * @param definition - id, combo, and the action to run.
   */
  register(definition: ShortcutDefinition): () => void {
    return this.ctx.effect(() => {
      this.definitions.push(definition)
      return () => {
        const index = this.definitions.indexOf(definition)
        if (index >= 0) this.definitions.splice(index, 1)
      }
    }, `shortcuts.register(${definition.id})`)
  }

  /**
   * The primary combination in force for this carrier.
   * @returns `undefined` when the shortcut is unbound on this carrier.
   */
  effectiveCombo(definition: ShortcutDefinition): Combo | undefined {
    if (this.platform === 'browser') {
      if (definition.browserCombo === false) return undefined
      if (definition.browserCombo !== undefined) return definition.browserCombo
    }
    return definition.combo
  }

  /** Everything bound right now, for the command palette's hint column. */
  list(): readonly { definition: ShortcutDefinition; combo: Combo; label: string }[] {
    const rows: { definition: ShortcutDefinition; combo: Combo; label: string }[] = []
    for (const definition of this.definitions) {
      const combo = this.effectiveCombo(definition)
      if (combo === undefined) continue
      rows.push({ definition, combo, label: formatCombo(combo) })
    }
    return rows
  }

  /**
   * Resolves a key event and runs the matching binding.
   * @param event - the keydown being considered.
   * @returns whether a binding consumed the event.
   */
  handle(event: KeyboardEvent): boolean {
    for (const definition of this.definitions) {
      if (!this.matches(definition, event)) continue
      if (definition.allowInTextEntry === false && isTextEntry(event.target) && !inXterm(event.target)) continue
      if (!definition.run()) return false
      return true
    }
    return false
  }

  private matches(definition: ShortcutDefinition, event: KeyboardEvent): boolean {
    if (this.platform === 'browser') {
      if (definition.browserCombo === false) return false
      if (definition.browserCombo !== undefined) return comboMatches(definition.browserCombo, event)
    }
    if (comboMatches(definition.combo, event)) return true
    return definition.aliases?.some(alias => comboMatches(alias, event)) === true
  }
}

function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'
}

function inXterm(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest('.xterm') !== null
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    shortcuts: ShortcutRegistry
  }
}
