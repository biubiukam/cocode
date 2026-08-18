import { afterEach, describe, expect, it } from "vitest"
import { revealLabel } from "../src/client/locales.ts"

const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator")

afterEach(() => {
  if (originalNavigator === undefined) delete (globalThis as { navigator?: unknown }).navigator
  else Object.defineProperty(globalThis, "navigator", originalNavigator)
})

describe("revealLabel", () => {
  it("uses Finder on macOS", () => {
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { platform: "MacIntel", language: "zh-CN" } })
    expect(revealLabel()).toBe("在 Finder 中显示")
  })

  it("uses the generic file manager label elsewhere", () => {
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { platform: "Linux x86_64", language: "zh-CN" } })
    expect(revealLabel()).toBe("在文件管理器中显示")
  })
})
