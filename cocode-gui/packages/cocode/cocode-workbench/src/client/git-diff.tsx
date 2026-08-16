/**
 * 统一差异视图。把 `git diff` 的补丁按行拆开并还原双侧行号，逐行着色渲染。
 * 面板通常只有几百像素宽，单栏统一视图比左右对照更容易读完整行。
 */
import { useMemo } from "react"
import { State, useRemote } from "./panel-state.tsx"
import { gitRequest, type GitDiff, type GitGroup } from "./git-client.ts"
import { t } from "./locales.ts"
import css from "./git-diff.module.css"

type DiffLineKind = "hunk" | "add" | "del" | "context"

interface DiffLine {
  readonly kind: DiffLineKind
  readonly text: string
  readonly oldLine?: number
  readonly newLine?: number
}

/** `@@ -12,7 +12,9 @@` → 旧侧从 12 行起，新侧从 12 行起。 */
function parseHunkHeader(line: string): { old: number; next: number } | undefined {
  const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line)
  if (match === null) return undefined
  return { old: Number.parseInt(match[1] ?? "1", 10), next: Number.parseInt(match[2] ?? "1", 10) }
}

/**
 * 拆解补丁。`diff --git`、`index`、`---`/`+++` 这些文件头对阅读差异没有帮助，
 * 直接丢弃；行号由 hunk 头起算，两侧各自推进。
 */
export function parsePatch(patch: string): readonly DiffLine[] {
  const lines: DiffLine[] = []
  let oldLine = 0
  let newLine = 0
  for (const raw of patch.split("\n")) {
    if (raw.startsWith("@@")) {
      const header = parseHunkHeader(raw)
      if (header === undefined) continue
      oldLine = header.old
      newLine = header.next
      lines.push({ kind: "hunk", text: raw })
      continue
    }
    if (oldLine === 0 && newLine === 0) continue
    if (raw.startsWith("\\")) continue
    if (raw.startsWith("+")) {
      lines.push({ kind: "add", text: raw.slice(1), newLine })
      newLine += 1
      continue
    }
    if (raw.startsWith("-")) {
      lines.push({ kind: "del", text: raw.slice(1), oldLine })
      oldLine += 1
      continue
    }
    // 补丁末尾那一段空串不是上下文行，丢掉以免多出一行空白。
    if (raw === "" && lines.length > 0) continue
    lines.push({ kind: "context", text: raw.startsWith(" ") ? raw.slice(1) : raw, oldLine, newLine })
    oldLine += 1
    newLine += 1
  }
  return lines
}

const MARKS: Record<DiffLineKind, string> = { add: "+", del: "-", context: " ", hunk: "" }

/** 二进制文件没有 hunk，git 只给出一行说明，据此与“无差异”区分开。 */
function isBinary(patch: string): boolean {
  return /^(?:Binary files|GIT binary patch)/m.test(patch)
}

export function GitDiffView(props: {
  readonly sessionId: string | undefined
  readonly cwd?: string
  readonly repoPath: string
  readonly group: GitGroup
}) {
  const { sessionId, cwd, repoPath, group } = props
  const remote = useRemote<GitDiff | undefined>(
    signal => sessionId === undefined
      ? Promise.resolve(undefined)
      : gitRequest<GitDiff>("git.diff", { sessionId, cwd, path: repoPath, group }, signal),
    [sessionId, cwd, repoPath, group],
  )
  const lines = useMemo(() => parsePatch(remote.value?.patch ?? ""), [remote.value?.patch])

  if (remote.loading || remote.error !== undefined) return <State loading={remote.loading} error={remote.error} />
  if (isBinary(remote.value?.patch ?? "")) return <State loading={false} empty={t("git.diffBinary")} />
  if (lines.length === 0) return <State loading={false} empty={t("git.diffEmpty")} />

  return <div className={css.diff}>
    <div className={css.summary}>
      <span className={css.scope}>{group === "index" ? t("git.diffStaged") : t("git.diffWorktree")}</span>
      <span className={css.added}>+{remote.value?.added ?? 0}</span>
      <span className={css.removed}>−{remote.value?.removed ?? 0}</span>
    </div>
    <div className={css.scroll}>
      <table className={css.table}>
        <tbody>
          {lines.map((line, index) => <tr key={index} className={css.line} data-kind={line.kind}>
            <td className={css.gutter}>{line.oldLine ?? ""}</td>
            <td className={css.gutter}>{line.newLine ?? ""}</td>
            <td className={css.mark}>{MARKS[line.kind]}</td>
            <td className={css.text}>{line.text}</td>
          </tr>)}
        </tbody>
      </table>
    </div>
  </div>
}
