import type { MenuEntry } from "@deepseek-ai/dsh-client-ui-primitives"
import { revealLabel } from "./locales.ts"

/** Every command the file tree context menu can emit. */
export type FileCommand =
  | "open" | "addToChat"
  | "newFile" | "newFolder" | "refresh"
  | "copy" | "cut" | "paste"
  | "rename" | "delete"
  | "copyPath" | "copyRelativePath" | "reveal"

export function isFileCommand(id: string): id is FileCommand {
  return ["open", "addToChat", "newFile", "newFolder", "refresh", "copy", "cut", "paste", "rename", "delete", "copyPath", "copyRelativePath", "reveal"].includes(id)
}

/**
 * Build the menu for one tree target. The workspace root keeps only the
 * commands that make sense on it: it can never be renamed, moved or deleted.
 */
export function fileMenuEntries(target: { readonly isDir: boolean; readonly isRoot: boolean; readonly canPaste: boolean }): readonly MenuEntry[] {
  const entries: MenuEntry[] = []
  if (!target.isDir) {
    entries.push(
      { id: "open", label: "打开" },
      { id: "addToChat", label: "添加到聊天" },
      { type: "separator", id: "sep-open" },
    )
  }
  entries.push({ id: "newFile", label: "新建文件" }, { id: "newFolder", label: "新建文件夹" })
  if (target.isDir) entries.push({ id: "refresh", label: "刷新" })
  entries.push({ type: "separator", id: "sep-new" })
  if (!target.isRoot) entries.push({ id: "copy", label: "复制" }, { id: "cut", label: "剪切" })
  entries.push({ id: "paste", label: "粘贴", disabled: !target.canPaste })
  entries.push({ type: "separator", id: "sep-clipboard" })
  if (!target.isRoot) {
    entries.push({ id: "rename", label: "重命名" }, { id: "delete", label: "删除", danger: true }, { type: "separator", id: "sep-edit" })
  }
  entries.push({ id: "copyPath", label: "复制路径" })
  if (!target.isRoot) entries.push({ id: "copyRelativePath", label: "复制相对路径" })
  entries.push({ id: "reveal", label: revealLabel() })
  return entries
}
