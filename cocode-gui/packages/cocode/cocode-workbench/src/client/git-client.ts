/**
 * Git 面板的数据层：后端返回结构的镜像类型、请求封装，以及把扁平的变更列表
 * 整理成界面直接可渲染的分组。视图层因此只负责画，不做任何 git 语义判断。
 */
import { workbenchRequest } from "./runtime-api.ts"

export type GitGroup = "merge" | "index" | "worktree" | "untracked"
export type GitOperation = "merge" | "rebase" | "cherry-pick" | "revert"

export interface GitFile {
  readonly path: string
  readonly group: GitGroup
  readonly status: string
  readonly from?: string
}

export interface GitRepo {
  readonly isRepo: true
  readonly root: string
  readonly branch: string
  readonly detached: boolean
  readonly upstream?: string
  readonly ahead: number
  readonly behind: number
  readonly hasRemote: boolean
  readonly stashCount: number
  readonly operation?: GitOperation
  readonly files: readonly GitFile[]
}

export type GitStatus = GitRepo | { readonly isRepo: false; readonly files: readonly GitFile[] }

export interface GitDiff {
  readonly path: string
  readonly patch: string
  readonly added: number
  readonly removed: number
}

export interface GitBranch {
  readonly name: string
  readonly upstream?: string
  readonly current: boolean
}

export interface GitStash {
  readonly index: number
  readonly label: string
}

export interface GitCommit {
  readonly hash: string
  readonly shortHash: string
  readonly author: string
  readonly date: string
  readonly subject: string
  readonly refs: string
}

/**
 * 界面上的一行。同一路径的暂存态与工作区态是两行，各自携带自己的分组，行内
 * 操作（暂存 / 取消暂存 / 放弃）据此分派到不同的后端命令。
 */
export interface GitRow {
  /** 分组内稳定的行标识，供 React key 与多选使用。 */
  readonly id: string
  readonly path: string
  readonly name: string
  /** 去掉文件名后的目录部分，可能为空串（仓库根下的文件）。 */
  readonly directory: string
  /** 小写扩展名，供图标着色；无扩展名时为空串。 */
  readonly ext: string
  readonly group: GitGroup
  readonly status: string
  readonly from?: string
}

export interface GitSection {
  /** 分组标识；worktree 段同时容纳未跟踪文件。 */
  readonly id: "merge" | "index" | "worktree"
  readonly rows: readonly GitRow[]
}

export interface CommitModelRoute {
  readonly provider: string
  readonly model: string
}

export interface CommitModelOption extends CommitModelRoute {
  readonly providerName: string
  readonly modelName: string
}

/** `git.models` 的返回：可选模型、已保存的选择、以及这次实际会打到的路由。 */
export interface CommitModels {
  readonly options: readonly CommitModelOption[]
  readonly configured: CommitModelRoute
  readonly writable: boolean
  readonly resolved?: CommitModelRoute
}

export function gitRequest<T>(method: string, payload: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  return workbenchRequest<T>(method, payload, signal)
}

export function fetchStatus(sessionId: string, signal?: AbortSignal): Promise<GitStatus> {
  return gitRequest<GitStatus>("git.status", { sessionId }, signal)
}

function splitPath(path: string): { name: string; directory: string } {
  const boundary = path.lastIndexOf("/")
  return boundary < 0
    ? { name: path, directory: "" }
    : { name: path.slice(boundary + 1), directory: path.slice(0, boundary) }
}

/** `.gitignore` 这类点开头的名字整体是文件名，没有扩展名。 */
function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".")
  return dot <= 0 || dot === name.length - 1 ? "" : name.slice(dot + 1).toLowerCase()
}

function toRow(file: GitFile): GitRow {
  const { name, directory } = splitPath(file.path)
  return {
    id: `${file.group}:${file.path}`,
    path: file.path,
    name,
    directory,
    ext: extensionOf(name),
    group: file.group,
    status: file.status,
    ...(file.from === undefined ? {} : { from: file.from }),
  }
}

/**
 * 归组。未跟踪文件与工作区改动合并成同一段（VS Code 的「更改」也是这样），
 * 但每行保留自己的 group，所以放弃未跟踪文件走的仍然是删除而非还原。
 */
export function sectionsOf(files: readonly GitFile[]): readonly GitSection[] {
  const rows = files.map(toRow)
  const pick = (...groups: readonly GitGroup[]): readonly GitRow[] =>
    rows.filter(row => groups.includes(row.group))
  return [
    { id: "merge", rows: pick("merge") },
    { id: "index", rows: pick("index") },
    { id: "worktree", rows: pick("worktree", "untracked") },
  ] as const
}

/** 状态字母在界面上的呈现：未跟踪显示 U，其余沿用 git 的字母。 */
export function statusLetter(row: GitRow): string {
  return row.group === "untracked" ? "U" : row.status.toUpperCase()
}

/**
 * 着色分类，对应 CSS 里的 `data-tone`。与 VS Code 的资源装饰同调：新增和未
 * 跟踪为绿、修改为黄、删除与冲突为红。
 */
export function statusTone(row: GitRow): "added" | "modified" | "deleted" | "conflict" {
  if (row.group === "merge") return "conflict"
  if (row.group === "untracked") return "added"
  const letter = row.status.toUpperCase()
  if (letter === "A" || letter === "C") return "added"
  if (letter === "D") return "deleted"
  if (letter === "U") return "conflict"
  return "modified"
}
