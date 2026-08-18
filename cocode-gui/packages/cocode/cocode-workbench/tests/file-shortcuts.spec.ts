import { describe, expect, it, vi } from "vitest"
import {
  FILE_ADD_TO_CHAT_COMMAND,
  FILE_OPEN_COMMAND,
  fileShortcutCommands,
  setActiveFileShortcutTarget,
} from "../src/client/file-shortcuts.ts"

describe("file list shortcuts", () => {
  it("exposes the VS Code/Cursor-aligned defaults", () => {
    const commands = Object.fromEntries(fileShortcutCommands().map(command => [command.id, command]))
    expect(commands[FILE_OPEN_COMMAND]?.defaultCombo).toEqual({ key: "Enter" })
    expect(commands[FILE_ADD_TO_CHAT_COMMAND]?.defaultCombo).toEqual({ key: "l", primary: true })
  })

  it("only runs when the file list is active", () => {
    const run = vi.fn(() => true)
    setActiveFileShortcutTarget({ isActive: () => false, run })
    expect(fileShortcutCommands().find(command => command.id === FILE_OPEN_COMMAND)?.run()).toBe(false)
    expect(run).not.toHaveBeenCalled()
    setActiveFileShortcutTarget({ isActive: () => true, run })
    expect(fileShortcutCommands().find(command => command.id === FILE_OPEN_COMMAND)?.run()).toBe(true)
    expect(run).toHaveBeenCalledWith(FILE_OPEN_COMMAND)
    setActiveFileShortcutTarget(undefined)
  })
})
