/**
 * Terminal appearance, read from CSS instead of hard-coded in TypeScript.
 *
 * xterm paints on a canvas and therefore needs concrete color and font
 * values, but the app flips its color scheme at runtime. The palette lives in
 * `terminal.module.css` as custom properties (surface colors alias the design
 * tokens, the sixteen ANSI slots are declared per scheme), so this module only
 * samples the container and reports flips.
 */
import type { ITheme } from "@xterm/xterm"

/** ANSI slot names as xterm spells them; each maps to one custom property. */
const ANSI_SLOTS = [
  "black", "red", "green", "yellow", "blue", "magenta", "cyan", "white",
  "brightBlack", "brightRed", "brightGreen", "brightYellow",
  "brightBlue", "brightMagenta", "brightCyan", "brightWhite",
] as const

const DEFAULT_FONT_SIZE = 12

/** `brightBlack` → `--cocode-terminal-bright-black`. */
function propertyName(slot: string): string {
  return `--cocode-terminal-${slot.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`
}

/**
 * Watch for color-scheme flips. The shell toggles one body attribute, so a
 * single observer covers both the user's choice and an OS change.
 * @returns the disposer.
 */
export function subscribeColorScheme(listener: () => void): () => void {
  if (typeof document === "undefined") return () => {}
  const observer = new MutationObserver(() => { listener() })
  observer.observe(document.body, { attributes: true, attributeFilter: ["data-ds-dark-theme"] })
  return () => { observer.disconnect() }
}

/** Sample the palette currently applied to the terminal container. */
export function readTerminalTheme(container: HTMLElement): ITheme {
  const style = getComputedStyle(container)
  const value = (slot: string): string => style.getPropertyValue(propertyName(slot)).trim()
  const ansi = Object.fromEntries(ANSI_SLOTS.map(slot => [slot, value(slot)] as const))
  return {
    ...ansi,
    background: value("background"),
    foreground: value("foreground"),
    cursor: value("cursor"),
    cursorAccent: value("background"),
    selectionBackground: value("selection"),
  }
}

/** Sample the font the design system assigns to code surfaces. */
export function readTerminalFont(container: HTMLElement): { fontFamily: string; fontSize: number } {
  const style = getComputedStyle(container)
  const size = Number.parseFloat(style.getPropertyValue(propertyName("font-size")))
  return {
    fontFamily: style.getPropertyValue(propertyName("font-family")).trim(),
    fontSize: Number.isFinite(size) && size > 0 ? size : DEFAULT_FONT_SIZE,
  }
}
