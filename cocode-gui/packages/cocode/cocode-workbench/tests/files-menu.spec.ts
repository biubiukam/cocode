import { describe, expect, it } from "vitest"
import { fileMentionText } from "../src/client/file-mention.ts"
import { fileMenuEntries, isFileCommand } from "../src/client/files-menu.ts"

describe("file tree chat insertion", () => {
  it("offers add-to-chat for files but not folders", () => {
    const fileIds = fileMenuEntries({ isDir: false, isRoot: false, canPaste: false }).map(entry => entry.id)
    const folderIds = fileMenuEntries({ isDir: true, isRoot: false, canPaste: false }).map(entry => entry.id)

    expect(fileIds).toContain("addToChat")
    expect(fileIds).not.toContain("openBottom")
    expect(folderIds).not.toContain("addToChat")
    expect(isFileCommand("addToChat")).toBe(true)
  })

  it("uses the same file mention projection as the at picker", () => {
    expect(fileMentionText("src/main.ts")).toBe("@src/main.ts ")
    expect(fileMentionText("docs/design note.md")).toBe('@"docs/design note.md" ')
  })
})
