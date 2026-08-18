import type { MenuEntry } from "@deepseek-ai/dsh-client-ui-primitives"
import { revealLabel, t } from "./locales.ts"

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
      { id: "open", label: t("files.open") },
      { id: "addToChat", label: t("files.addToChat") },
      { type: "separator", id: "sep-open" },
    )
  }
  entries.push({ id: "newFile", label: t("files.newFile") }, { id: "newFolder", label: t("files.newFolder") })
  if (target.isDir) entries.push({ id: "refresh", label: t("files.refresh") })
  entries.push({ type: "separator", id: "sep-new" })
  if (!target.isRoot) entries.push({ id: "copy", label: t("files.copy") }, { id: "cut", label: t("files.cut") })
  entries.push({ id: "paste", label: t("files.paste"), disabled: !target.canPaste })
  entries.push({ type: "separator", id: "sep-clipboard" })
  if (!target.isRoot) {
    entries.push({ id: "rename", label: t("files.rename") }, { id: "delete", label: t("files.delete"), danger: true }, { type: "separator", id: "sep-edit" })
  }
  entries.push({ id: "copyPath", label: t("files.copyPath") })
  if (!target.isRoot) entries.push({ id: "copyRelativePath", label: t("files.copyRelativePath") })
  entries.push({ id: "reveal", label: revealLabel() })
  return entries
}
