/**
 * Git 工作区状态模型与 `--porcelain=v2 -z` 解析。
 *
 * 分组与 VS Code 源代码管理视图同构：一个文件的暂存改动与工作区改动是两条
 * 独立记录，因此同一路径可以同时出现在 index 与 worktree 两组里（暂存一半、
 * 又继续编辑的常见情形）。合并冲突自成一组，必须先解决再提交。
 */

/** 变更所属分组，决定行内可用操作与批量命令的走向。 */
export type GitGroup = "merge" | "index" | "worktree" | "untracked"

/** 仓库当前处于的多步操作，未完成时提交语义与平时不同。 */
export type GitOperation = "merge" | "rebase" | "cherry-pick" | "revert"

export interface GitFile {
  /** 相对仓库根的路径，正斜杠分隔。 */
  readonly path: string
  readonly group: GitGroup
  /** 单字母状态：M/A/D/R/C/T，未跟踪为 ?，冲突为 U。 */
  readonly status: string
  /** 重命名或复制的来源路径。 */
  readonly from?: string
}

export interface GitBranchInfo {
  /** 分支名；游离 HEAD 时是短 commit id。 */
  readonly branch: string
  readonly detached: boolean
  readonly upstream?: string
  /** 领先上游的提交数，无上游时为 0。 */
  readonly ahead: number
  readonly behind: number
}

export interface ParsedStatus extends GitBranchInfo {
  readonly files: readonly GitFile[]
}

/** 冲突记录的统一状态字母，UI 据此着色为“冲突”。 */
const CONFLICT = "U"

const HEADER_HEAD = "# branch.head "
const HEADER_OID = "# branch.oid "
const HEADER_UPSTREAM = "# branch.upstream "
const HEADER_AB = "# branch.ab "

/** `+3 -1` → 领先 3、落后 1。缺失或异常一律按 0 计。 */
function parseAheadBehind(value: string): { ahead: number; behind: number } {
  const [plus, minus] = value.split(" ")
  const count = (token: string | undefined): number => {
    const parsed = Number.parseInt(token?.slice(1) ?? "", 10)
    return Number.isFinite(parsed) ? Math.abs(parsed) : 0
  }
  return { ahead: count(plus), behind: count(minus) }
}

/**
 * 普通/重命名记录的路径起始字段下标。重命名记录（`2`）比普通记录（`1`）多一个
 * 相似度字段，其来源路径则由紧随其后的独立 NUL 段承载。
 */
function pathOffset(kind: string): number {
  return kind === "2" ? 9 : 8
}

/** 路径本身可能含空格，切分后要把尾部字段重新拼回去。 */
function tailFrom(fields: readonly string[], offset: number): string {
  return fields.slice(offset).join(" ")
}

/**
 * 解析 `git status --porcelain=v2 --branch -z --untracked-files=all` 的输出。
 * 记录以 NUL 分隔，重命名记录额外占用其后的一段作为来源路径。
 */
export function parseStatus(raw: string): ParsedStatus {
  const records = raw.split("\0")
  const files: GitFile[] = []
  let branch = "HEAD"
  let detached = false
  let head: string | undefined
  let oid: string | undefined
  let upstream: string | undefined
  let ahead = 0
  let behind = 0

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]
    if (record === undefined || record === "") continue

    if (record.startsWith("#")) {
      if (record.startsWith(HEADER_HEAD)) head = record.slice(HEADER_HEAD.length)
      else if (record.startsWith(HEADER_OID)) oid = record.slice(HEADER_OID.length)
      else if (record.startsWith(HEADER_UPSTREAM)) upstream = record.slice(HEADER_UPSTREAM.length)
      else if (record.startsWith(HEADER_AB)) ({ ahead, behind } = parseAheadBehind(record.slice(HEADER_AB.length)))
      continue
    }

    const kind = record[0] ?? ""
    if (kind === "!") continue
    if (kind === "?") {
      files.push({ path: record.slice(2), group: "untracked", status: "?" })
      continue
    }
    if (kind === "u") {
      files.push({ path: tailFrom(record.split(" "), 10), group: "merge", status: CONFLICT })
      continue
    }
    if (kind !== "1" && kind !== "2") continue

    const fields = record.split(" ")
    const path = tailFrom(fields, pathOffset(kind))
    let from: string | undefined
    if (kind === "2") {
      index += 1
      from = records[index]
    }
    const marks = fields[1] ?? ".."
    const staged = marks[0] ?? "."
    const unstaged = marks[1] ?? "."
    // 暂存态与工作区态各自成行，与 VS Code 的两个分组一一对应。
    if (staged !== ".") files.push({ path, group: "index", status: staged, ...(from === undefined ? {} : { from }) })
    if (unstaged !== ".") files.push({ path, group: "worktree", status: unstaged })
  }

  if (head === "(detached)" || head === undefined) {
    detached = head === "(detached)"
    branch = detached ? (oid ?? "HEAD").slice(0, 7) : "HEAD"
  } else {
    branch = head
  }

  return { branch, detached, ...(upstream === undefined ? {} : { upstream }), ahead, behind, files }
}

/** 解析 `git stash list --format=%gd%x1f%gs`，index 即 `stash@{n}` 的 n。 */
export function parseStashes(raw: string): readonly { readonly index: number; readonly label: string }[] {
  return raw.split("\n").filter(line => line !== "").flatMap(line => {
    const [ref, label] = line.split("\x1f")
    const index = Number.parseInt(ref?.match(/\{(\d+)\}/)?.[1] ?? "", 10)
    return Number.isFinite(index) ? [{ index, label: label ?? ref ?? "" }] : []
  })
}

export interface GitCommit {
  readonly hash: string
  readonly shortHash: string
  readonly author: string
  readonly date: string
  readonly subject: string
  /** `HEAD -> main, origin/main` 形式的引用装饰，可能为空串。 */
  readonly refs: string
}

/** 解析 `git log` 的 \x1f 分隔字段 + \0 分隔记录，主题里的换行因此得以保留。 */
export function parseLog(raw: string): readonly GitCommit[] {
  return raw.split("\0").filter(record => record.trim() !== "").map(record => {
    const [hash, shortHash, author, date, subject, refs] = record.replace(/^\n/, "").split("\x1f")
    return {
      hash: hash ?? "",
      shortHash: shortHash ?? "",
      author: author ?? "",
      date: date ?? "",
      subject: subject ?? "",
      refs: refs ?? "",
    }
  })
}

/** 统一 diff 文本的增删行数，供文件行显示 +N −M。 */
export function countDiffLines(patch: string): { added: number; removed: number } {
  let added = 0
  let removed = 0
  for (const line of patch.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) added += 1
    else if (line.startsWith("-") && !line.startsWith("---")) removed += 1
  }
  return { added, removed }
}
