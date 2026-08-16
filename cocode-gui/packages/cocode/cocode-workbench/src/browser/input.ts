/**
 * Human input translation.
 *
 * A remote viewport turns three things the local browser gave us for free into
 * work we must do: input method composition, clipboard and file upload.
 * Composition in particular must never be forwarded key by key — the candidate
 * window would belong to the host page and the remote text would be garbage.
 */
import type { BrowserTab } from "./tabs.ts"
import type { BrowserInputEvent, BrowserModifier } from "./protocol.ts"

const MODIFIER_BITS: Readonly<Record<BrowserModifier, number>> = { alt: 1, ctrl: 2, meta: 4, shift: 8 }

function modifierMask(modifiers: readonly BrowserModifier[] | undefined): number {
  return (modifiers ?? []).reduce((mask, name) => mask | MODIFIER_BITS[name], 0)
}

/** Keys whose virtual code the page needs in order to react at all. */
const VIRTUAL_KEY_CODES: Readonly<Record<string, number>> = {
  Backspace: 8, Tab: 9, Enter: 13, Shift: 16, Control: 17, Alt: 18, Meta: 91,
  Escape: 27, " ": 32, PageUp: 33, PageDown: 34, End: 35, Home: 36,
  ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Delete: 46,
}

export function virtualKeyCode(key: string): number {
  const known = VIRTUAL_KEY_CODES[key]
  if (known !== undefined) return known
  if (key.length === 1) return key.toUpperCase().charCodeAt(0)
  if (/^F\d{1,2}$/.test(key)) return 111 + Number(key.slice(1))
  return 0
}

const CDP_BUTTONS: Readonly<Record<string, number>> = { left: 1, right: 2, middle: 4 }

/**
 * Apply one uplink event to the page. Returns true when the event should
 * invalidate the agent's current snapshot generation.
 */
export async function applyInput(tab: BrowserTab, event: BrowserInputEvent): Promise<boolean> {
  switch (event.kind) {
    case "mouse": {
      const type = event.type === "down" ? "mousePressed" : event.type === "up" ? "mouseReleased" : event.type === "wheel" ? "mouseWheel" : "mouseMoved"
      await tab.cdp.send("Input.dispatchMouseEvent", {
        type,
        x: event.x,
        y: event.y,
        button: event.button ?? "none",
        buttons: event.buttons ?? (event.button === undefined ? 0 : CDP_BUTTONS[event.button] ?? 0),
        clickCount: event.clickCount ?? (event.type === "down" || event.type === "up" ? 1 : 0),
        modifiers: modifierMask(event.modifiers),
        ...(event.type === "wheel" ? { deltaX: event.deltaX ?? 0, deltaY: event.deltaY ?? 0 } : {}),
      })
      return event.type === "down" || event.type === "wheel"
    }
    case "key": {
      const code = virtualKeyCode(event.key)
      await tab.cdp.send("Input.dispatchKeyEvent", {
        type: event.type === "down" ? "keyDown" : "keyUp",
        key: event.key,
        code: event.code,
        windowsVirtualKeyCode: code,
        nativeVirtualKeyCode: code,
        modifiers: modifierMask(event.modifiers),
        ...(event.text === undefined ? {} : { text: event.text }),
      })
      return event.type === "down"
    }
    case "text": {
      // Composition result or host paste: one atomic insertion.
      await tab.cdp.send("Input.insertText", { text: event.text })
      return true
    }
    default:
      return false
  }
}

/** Read the remote selection so the host clipboard can receive it. */
export async function readSelection(tab: BrowserTab): Promise<string> {
  try {
    return await tab.page.evaluate(() => window.getSelection()?.toString() ?? "")
  } catch { return "" }
}
