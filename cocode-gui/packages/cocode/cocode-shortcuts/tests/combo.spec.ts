import { describe, expect, it } from "vitest"
import {
  comboFromKeyboardEvent,
  comboId,
  formatCombo,
  isUsableCombo,
  matchesCombo,
  normalizeKey,
  toElectronAccelerator,
} from "../src/client/combo.ts"

describe("shortcut combos", () => {
  it("normalizes browser keys and produces stable ids", () => {
    expect(normalizeKey("b")).toBe("b")
    expect(normalizeKey("ArrowLeft")).toBe("ArrowLeft")
    expect(normalizeKey("Shift")).toBeUndefined()
    expect(comboId({ key: "b", primary: true }, "MacIntel")).toBe("primary+b")
  })

  it("maps primary modifiers to Electron's cross-platform accelerator", () => {
    expect(toElectronAccelerator({ key: "n", primary: true })).toBe("CommandOrControl+N")
    expect(toElectronAccelerator({ key: "p", primary: true, shift: true })).toBe("CommandOrControl+Shift+P")
  })

  it("maps Mac and Windows modifiers without persisting platform strings", () => {
    const event = { key: "k", metaKey: false, ctrlKey: true, altKey: false, shiftKey: true }
    expect(comboFromKeyboardEvent(event, "MacIntel")).toEqual({
      key: "k", primary: false, control: true, alt: false, shift: true,
    })
    expect(comboFromKeyboardEvent(event, "Win32")).toEqual({
      key: "k", primary: true, control: false, alt: false, shift: true,
    })
    expect(formatCombo({ key: "k", primary: true }, "MacIntel")).toBe("Cmd+K")
    expect(formatCombo({ key: "k", primary: true }, "Win32")).toBe("Ctrl+K")
    expect(matchesCombo({ key: "k", control: true, shift: true }, event, "Win32")).toBe(true)
  })

  it("rejects unmodified printable keys and dangerous quit/close keys", () => {
    expect(isUsableCombo({ key: "a" })).toBe(false)
    expect(isUsableCombo({ key: "q", primary: true })).toBe(false)
    expect(isUsableCombo({ key: "F4", alt: true })).toBe(false)
    expect(isUsableCombo({ key: "F2" })).toBe(true)
    expect(isUsableCombo({ key: "k", primary: true })).toBe(true)
  })
})
