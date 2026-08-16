export type Combo = {
  readonly key: string
  readonly primary?: boolean
  readonly alt?: boolean
  readonly shift?: boolean
  readonly control?: boolean
}

const MODIFIER_KEYS = new Set(["Alt", "AltGraph", "Control", "Meta", "Shift"])

const SPECIAL_KEYS: Record<string, string> = {
  " ": "Space",
  Backspace: "Backspace",
  Delete: "Delete",
  End: "End",
  Enter: "Enter",
  Escape: "Escape",
  Home: "Home",
  Insert: "Insert",
  PageDown: "PageDown",
  PageUp: "PageUp",
  Tab: "Tab",
  ArrowDown: "ArrowDown",
  ArrowLeft: "ArrowLeft",
  ArrowRight: "ArrowRight",
  ArrowUp: "ArrowUp",
}

function currentPlatform(): string {
  return typeof navigator === "undefined" ? "" : navigator.platform
}

function isMacPlatform(platform: string): boolean {
  return platform.toLowerCase().includes("mac")
}

/** Normalize a browser key into the platform-neutral shortcut vocabulary. */
export function normalizeKey(key: string): string | undefined {
  if (MODIFIER_KEYS.has(key)) return undefined
  if (/^F(?:[1-9]|1[0-2])$/i.test(key)) return key.toUpperCase()
  if (key in SPECIAL_KEYS) return SPECIAL_KEYS[key]
  if (key.length === 1) return key.toLowerCase()
  return key.length > 0 ? key : undefined
}

/** Convert a keyboard event into a persistable Combo, or reject modifiers alone. */
export function comboFromKeyboardEvent(
  event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">,
  platform = currentPlatform(),
): Combo | undefined {
  const key = normalizeKey(event.key)
  if (key === undefined) return undefined
  const mac = isMacPlatform(platform)
  return {
    key,
    primary: mac ? event.metaKey : event.ctrlKey,
    alt: event.altKey,
    shift: event.shiftKey,
    control: mac ? event.ctrlKey : false,
  }
}

/** Stable equality key used for conflict detection and browser matching. */
export function comboId(combo: Combo, platform = currentPlatform()): string {
  const mac = isMacPlatform(platform)
  return [
    combo.primary || (!mac && combo.control) ? "primary" : "",
    mac && combo.control ? "control" : "",
    combo.alt ? "alt" : "",
    combo.shift ? "shift" : "",
    combo.key.toLowerCase(),
  ].filter(Boolean).join("+")
}

/** Match one normalized Combo against a browser keyboard event. */
export function matchesCombo(
  combo: Combo,
  event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">,
  platform = currentPlatform(),
): boolean {
  const key = normalizeKey(event.key)
  if (key === undefined || key.toLowerCase() !== combo.key.toLowerCase()) return false
  const mac = isMacPlatform(platform)
  if (mac) {
    if (Boolean(combo.primary) !== event.metaKey) return false
    if (Boolean(combo.control) !== event.ctrlKey) return false
  } else {
    if (event.metaKey) return false
    if (Boolean(combo.primary || combo.control) !== event.ctrlKey) return false
  }
  if (Boolean(combo.alt) !== event.altKey) return false
  if (Boolean(combo.shift) !== event.shiftKey) return false
  return true
}

function comboKeyLabel(combo: Combo): string {
  return combo.key.length === 1 ? combo.key.toUpperCase() : combo.key
}

/** Format a Combo for the current platform and the settings UI. */
export function formatCombo(combo: Combo | undefined, platform = currentPlatform()): string {
  if (combo === undefined) return ""
  const mac = isMacPlatform(platform)
  const parts: string[] = []
  if (combo.primary) parts.push(mac ? "Cmd" : "Ctrl")
  if (combo.control && (mac || !combo.primary)) parts.push("Ctrl")
  if (combo.alt) parts.push(mac ? "Option" : "Alt")
  if (combo.shift) parts.push("Shift")
  parts.push(comboKeyLabel(combo))
  return parts.join("+")
}

/** Compact glyph form for keycaps: ⌘B on macOS, Ctrl+B elsewhere. */
export function formatComboGlyphs(combo: Combo | undefined, platform = currentPlatform()): string {
  if (combo === undefined) return ""
  if (!isMacPlatform(platform)) return formatCombo(combo, platform)
  const parts: string[] = []
  if (combo.control) parts.push("⌃")
  if (combo.alt) parts.push("⌥")
  if (combo.shift) parts.push("⇧")
  if (combo.primary) parts.push("⌘")
  parts.push(comboKeyLabel(combo))
  return parts.join("")
}

/** Search haystack covering both the readable and glyph renderings. */
export function formatComboSearchText(combo: Combo | undefined, platform = currentPlatform()): string {
  const readable = formatCombo(combo, platform)
  const glyphs = formatComboGlyphs(combo, platform)
  return readable === glyphs ? readable : `${readable} ${glyphs}`
}

/** Convert a Combo to Electron's platform-neutral accelerator syntax. */
export function toElectronAccelerator(combo: Combo): string {
  const parts: string[] = []
  if (combo.primary) parts.push("CommandOrControl")
  if (combo.control && !combo.primary) parts.push("Control")
  if (combo.alt) parts.push("Alt")
  if (combo.shift) parts.push("Shift")
  parts.push(combo.key.length === 1 ? combo.key.toUpperCase() : combo.key)
  return parts.join("+")
}

/** Reject dangerous or ambiguous bindings before they reach the settings file. */
export function isUsableCombo(combo: Combo): boolean {
  if (combo.key.length === 1 && !combo.primary && !combo.control && !combo.alt && !combo.shift) return false
  if (combo.primary && ["q", "w"].includes(combo.key.toLowerCase()) && !combo.shift && !combo.alt) return false
  if (combo.alt && combo.key.toLowerCase() === "f4" && !combo.primary && !combo.control && !combo.shift) return false
  return combo.key.length > 0
}

export function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable || target.closest("[contenteditable]") !== null) return true
  if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return true
  return target.closest(".xterm") !== null
}
