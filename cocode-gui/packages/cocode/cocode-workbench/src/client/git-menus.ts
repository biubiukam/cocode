/**
 * Git 面板的菜单构建。全部是纯函数：输入当前仓库状态，输出菜单条目，UI 只负责
 * 弹出与派发。可用性判断集中在这里，视图层不再散落 `disabled` 逻辑。
 */
import type { MenuEntry, MenuItem } from "@deepseek-ai/dsh-client-ui-primitives"
import type { GitBranch, GitRepo, GitRow, GitStash } from "./git-client.ts"
import { revealLabel, t } from "./locales.ts"

export type GitCommand =
  | "refresh" | "init"
  | "commit" | "commitPush" | "commitSync" | "commitAmend" | "commitSignoff"
  | "openFile" | "openChanges" | "stage" | "unstage" | "discard" | "ignore" | "copyPath" | "reveal"
  | "stageAll" | "unstageAll" | "discardAll"
  | "push" | "pushForce" | "pull" | "pullRebase" | "fetch" | "sync"
  | "branchCreate" | "branchDelete"
  | "stashPush" | "stashPushUntracked" | "stashPop" | "stashApply" | "stashDrop"
  | "history" | "abortMerge"

/** 切换分支的菜单项以 `checkout:` 前缀承载分支名，避免再开一套回调。 */
export const CHECKOUT_PREFIX = "checkout:"

export function checkoutTarget(id: string): string | undefined {
  return id.startsWith(CHECKOUT_PREFIX) ? id.slice(CHECKOUT_PREFIX.length) : undefined
}

/** 提交按钮的下拉：主操作之外的几种提交变体。 */
export function commitMenuEntries(repo: GitRepo): readonly MenuEntry[] {
  return [
    { id: "commit", label: t("git.commit") },
    { id: "commitPush", label: t("git.commitAndPush"), disabled: !repo.hasRemote },
    { id: "commitSync", label: t("git.commitAndSync"), disabled: !repo.hasRemote },
    { type: "separator", id: "sep-commit" },
    { id: "commitAmend", label: t("git.commitAmend") },
    { id: "commitSignoff", label: t("git.commitSignoff") },
  ]
}

/**
 * 分支菜单：本地分支列表加上新建/删除。当前分支标为选中，因此不再重复列出
 * 切换到自身的动作。
 */
export function branchMenuEntries(
  repo: GitRepo,
  branches: readonly GitBranch[],
  remoteBranches: readonly string[] = [],
): readonly MenuEntry[] {
  const list: MenuEntry[] = branches.map(branch => ({
    id: `${CHECKOUT_PREFIX}${branch.name}`,
    label: branch.name,
    disabled: branch.current,
  }))
  // 只列出本地还没有的远程分支：切过去时 git 会自建同名的跟踪分支。
  const local = new Set(branches.map(branch => branch.name))
  for (const full of remoteBranches) {
    const short = full.slice(full.indexOf("/") + 1)
    if (short === "" || local.has(short)) continue
    local.add(short)
    list.push({ id: `${CHECKOUT_PREFIX}${short}`, label: full })
  }
  if (list.length > 0) list.push({ type: "separator", id: "sep-branches" })
  list.push({ id: "branchCreate", label: t("git.branchCreate") })
  list.push({ id: "branchDelete", label: t("git.branchDelete"), disabled: branches.length < 2, danger: true })
  return [{ type: "label", id: "branches-title", text: t("git.pickBranch") }, ...list]
}

/** Stash 子菜单；没有记录时只保留“Stash 更改”。 */
function stashEntries(repo: GitRepo, stashes: readonly GitStash[]): readonly MenuItem[] {
  const hasStash = stashes.length > 0
  return [
    { id: "stashPush", label: t("git.stashPush"), disabled: repo.files.length === 0 },
    { id: "stashPushUntracked", label: t("git.stashPushUntracked"), disabled: repo.files.length === 0 },
    { id: "stashPop", label: t("git.stashPop"), disabled: !hasStash },
    { id: "stashApply", label: t("git.stashApply"), disabled: !hasStash },
    { id: "stashDrop", label: t("git.stashDrop"), disabled: !hasStash },
  ]
}

/** 工具栏“更多”菜单：远端同步、Stash、历史，以及未完成操作的出口。 */
export function moreMenuEntries(repo: GitRepo, stashes: readonly GitStash[]): readonly MenuEntry[] {
  const remote = repo.hasRemote
  const entries: MenuEntry[] = [
    { id: "pull", label: t("git.pull"), disabled: !remote },
    { id: "pullRebase", label: t("git.pullRebase"), disabled: !remote },
    { id: "push", label: t("git.push"), disabled: !remote },
    { id: "pushForce", label: t("git.pushForce"), disabled: !remote, danger: true },
    { id: "fetch", label: t("git.fetch"), disabled: !remote },
    { type: "separator", id: "sep-remote" },
    { id: "stash", label: t("git.stash"), submenu: stashEntries(repo, stashes) },
    { type: "separator", id: "sep-stash" },
    { id: "history", label: t("git.history") },
  ]
  if (repo.operation === "merge") {
    entries.push({ type: "separator", id: "sep-operation" }, { id: "abortMerge", label: t("git.abortMerge"), danger: true })
  }
  return entries
}

/**
 * 文件行的右键菜单。暂存段提供“取消暂存”，其余段提供“暂存”；只有未跟踪文件
 * 能被加进 .gitignore。
 */
export function rowMenuEntries(row: GitRow): readonly MenuEntry[] {
  const staged = row.group === "index"
  return [
    { id: "openFile", label: t("git.openFile") },
    { id: "openChanges", label: t("git.openChanges") },
    { type: "separator", id: "sep-open" },
    staged
      ? { id: "unstage", label: t("git.unstage") }
      : { id: "stage", label: t("git.stage") },
    { id: "discard", label: t("git.discard"), danger: true },
    ...(row.group === "untracked" ? [{ id: "ignore", label: t("git.ignore") } satisfies MenuEntry] : []),
    { type: "separator", id: "sep-actions" },
    { id: "copyPath", label: t("git.copyPath") },
    { id: "reveal", label: revealLabel() },
  ]
}

export function sectionLabel(section: "merge" | "index" | "worktree"): string {
  if (section === "merge") return t("git.group.merge")
  if (section === "index") return t("git.group.index")
  return t("git.group.worktree")
}
