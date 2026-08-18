export interface Combo {
  readonly key: string
  readonly primary?: boolean
  readonly alt?: boolean
  readonly shift?: boolean
  readonly control?: boolean
}

export const FILE_OPEN_COMMAND = "cocode.files.open"
export const FILE_ADD_TO_CHAT_COMMAND = "cocode.files.addToChat"
export const FILE_RENAME_COMMAND = "cocode.files.rename"
export const FILE_DELETE_COMMAND = "cocode.files.delete"
export const FILE_COPY_COMMAND = "cocode.files.copy"
export const FILE_CUT_COMMAND = "cocode.files.cut"
export const FILE_PASTE_COMMAND = "cocode.files.paste"
export const FILE_SELECT_NEXT_COMMAND = "cocode.files.selectNext"
export const FILE_SELECT_PREVIOUS_COMMAND = "cocode.files.selectPrevious"
export const FILE_EXPAND_COMMAND = "cocode.files.expand"
export const FILE_COLLAPSE_COMMAND = "cocode.files.collapse"
export const FILE_CONTEXT_MENU_COMMAND = "cocode.files.contextMenu"
export const FILE_CANCEL_COMMAND = "cocode.files.cancel"

export interface FileShortcutTarget {
  readonly isActive: () => boolean
  readonly run: (commandId: string) => boolean
}

let activeTarget: FileShortcutTarget | undefined

export function setActiveFileShortcutTarget(target: FileShortcutTarget | undefined): void {
  activeTarget = target
}

export function activeFileShortcutTarget(): FileShortcutTarget | undefined {
  return activeTarget
}

export interface ShortcutCommandLike {
  readonly id: string
  readonly title: string
  readonly description?: string
  readonly defaultCombo?: Combo
  readonly run: () => boolean
}

export function fileShortcutCommands(): readonly ShortcutCommandLike[] {
  const command = (id: string, title: string, description: string, defaultCombo: Combo): ShortcutCommandLike => ({
    id,
    title,
    description,
    defaultCombo,
    run: () => {
      const target = activeTarget
      return target !== undefined && target.isActive() && target.run(id)
    },
  })
  return [
    command(FILE_OPEN_COMMAND, "打开文件", "打开当前选中的文件", { key: "Enter" }),
    command(FILE_ADD_TO_CHAT_COMMAND, "添加到聊天", "将当前文件作为 @文件 插入聊天输入框", { key: "l", primary: true }),
    command(FILE_RENAME_COMMAND, "重命名文件", "重命名当前选中的文件或文件夹", { key: "F2" }),
    command(FILE_DELETE_COMMAND, "删除文件", "删除当前选中的文件或文件夹", { key: "Delete" }),
    command(FILE_COPY_COMMAND, "复制文件", "复制当前选中的文件或文件夹", { key: "c", primary: true }),
    command(FILE_CUT_COMMAND, "剪切文件", "剪切当前选中的文件或文件夹", { key: "x", primary: true }),
    command(FILE_PASTE_COMMAND, "粘贴文件", "粘贴文件到当前目录", { key: "v", primary: true }),
    command(FILE_SELECT_PREVIOUS_COMMAND, "选择上一个文件", "在文件列表中选择上一项", { key: "ArrowUp" }),
    command(FILE_SELECT_NEXT_COMMAND, "选择下一个文件", "在文件列表中选择下一项", { key: "ArrowDown" }),
    command(FILE_EXPAND_COMMAND, "展开文件夹", "展开当前文件夹或进入其第一项", { key: "ArrowRight" }),
    command(FILE_COLLAPSE_COMMAND, "收起文件夹", "收起当前文件夹或选择其父目录", { key: "ArrowLeft" }),
    command(FILE_CONTEXT_MENU_COMMAND, "打开文件菜单", "打开当前项的右键菜单", { key: "F10", shift: true }),
    command(FILE_CANCEL_COMMAND, "取消文件操作", "取消当前文件列表操作", { key: "Escape" }),
  ]
}
