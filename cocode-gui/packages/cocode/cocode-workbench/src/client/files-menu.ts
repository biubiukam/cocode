import type { MenuEntry } from "@deepseek-ai/dsh-client-ui-primitives"
import {
  FILE_ADD_TO_CHAT_COMMAND, FILE_COPY_COMMAND, FILE_CUT_COMMAND,
  FILE_DELETE_COMMAND, FILE_OPEN_COMMAND, FILE_PASTE_COMMAND, FILE_RENAME_COMMAND,
} from "./file-shortcuts.ts"
import { revealLabel, t } from "./locales.ts"

type FileMenuEntry = MenuEntry & { readonly shortcut?: string }

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
const SHORTCUT_COMMAND: Readonly<Partial<Record<FileCommand, string>>> = {
  open: FILE_OPEN_COMMAND,
  addToChat: FILE_ADD_TO_CHAT_COMMAND,
  copy: FILE_COPY_COMMAND,
  cut: FILE_CUT_COMMAND,
  paste: FILE_PASTE_COMMAND,
  rename: FILE_RENAME_COMMAND,
  delete: FILE_DELETE_COMMAND,
}

export function fileMenuEntries(
  target: { readonly isDir: boolean; readonly isRoot: boolean; readonly canPaste: boolean },
  shortcutLabel: (commandId: string) => string | undefined = () => undefined,
): readonly FileMenuEntry[] {
  const entries: FileMenuEntry[] = []
  const item = (id: FileCommand, label: string, options: { readonly disabled?: boolean; readonly danger?: boolean } = {}): FileMenuEntry => ({
    id,
    label,
    ...options,
    shortcut: SHORTCUT_COMMAND[id] === undefined ? undefined : shortcutLabel(SHORTCUT_COMMAND[id]),
  })
  if (!target.isDir) {
    entries.push(item("open", t("files.open")))
  }
  entries.push(item("addToChat", t("files.addToChat")), { type: "separator", id: "sep-open" })
  entries.push(item("newFile", t("files.newFile")), item("newFolder", t("files.newFolder")))
  if (target.isDir) entries.push(item("refresh", t("files.refresh")))
  entries.push({ type: "separator", id: "sep-new" })
  if (!target.isRoot) entries.push(item("copy", t("files.copy")), item("cut", t("files.cut")))
  entries.push(item("paste", t("files.paste"), { disabled: !target.canPaste }))
  entries.push({ type: "separator", id: "sep-clipboard" })
  if (!target.isRoot) {
    entries.push(item("rename", t("files.rename")), item("delete", t("files.delete"), { danger: true }), { type: "separator", id: "sep-edit" })
  }
  entries.push(item("copyPath", t("files.copyPath")))
  if (!target.isRoot) entries.push(item("copyRelativePath", t("files.copyRelativePath")))
  entries.push(item("reveal", revealLabel()))
  return entries
}
