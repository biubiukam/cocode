/**
 * Workbench 的 Git 后端。对外只暴露一个 {@link gitDispatch}，把 `git.*` 方法
 * 翻译成 execFile 调用——参数始终以数组传入，绝不拼接 shell 字符串，因此分支名
 * 与路径里的空格、引号都不会改变命令语义。
 *
 * 所有写操作的目标路径都必须落在仓库根内，取值不得以 `-` 开头，避免调用方把
 * 一个路径伪装成 git 选项。
 */
import { execFile } from "node:child_process"
import { access, appendFile, readFile } from "node:fs/promises"
import { isAbsolute, join, relative, resolve } from "pathe"
import { promisify } from "node:util"
import { resolveSessionCwd } from "./session-cwd.ts"
import { countDiffLines, parseLog, parseStashes, parseStatus, type GitFile, type GitGroup, type GitOperation } from "./git-status.ts"
import { generateCommitMessage, listModelOptions, resolveCommitRoute, truncateDiff } from "./commit-message.ts"
import { readCommitSettings, writeCommitSettings } from "./settings.ts"
import type { WorkbenchContext } from "./host-types.ts"

const exec = promisify(execFile)

/** 单条 git 输出上限；超出说明调用方该分页而不是继续放大缓冲。 */
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024
const DEFAULT_LOG_LIMIT = 50

interface GitResult {
  readonly stdout: string
  readonly stderr: string
}

/** git 失败时把 stderr 当作错误正文，命令行的诊断信息才不会丢在日志里。 */
function failure(error: unknown): Error {
  const stderr = typeof error === "object" && error !== null && "stderr" in error ? String(error.stderr) : ""
  const text = stderr.trim() !== "" ? stderr.trim() : error instanceof Error ? error.message : String(error)
  return new Error(text)
}

async function run(cwd: string, args: readonly string[]): Promise<GitResult> {
  try {
    const result = await exec("git", ["-C", cwd, "--no-pager", ...args], { maxBuffer: MAX_OUTPUT_BYTES })
    return { stdout: result.stdout, stderr: result.stderr }
  } catch (error) {
    throw failure(error)
  }
}

/** 只关心是否成功的探测命令，失败不抛出。 */
async function probe(cwd: string, args: readonly string[]): Promise<string | undefined> {
  try {
    return (await run(cwd, args)).stdout.trim()
  } catch { return undefined }
}

function textField(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key]
  return typeof value === "string" && value.trim() !== "" ? value : undefined
}

function flag(payload: Record<string, unknown>, key: string): boolean {
  return payload[key] === true
}

/** 拒绝会被 git 解读为选项、或藏有 NUL 的取值。 */
function safeValue(value: string | undefined, label: string): string {
  if (value === undefined || value === "" || value.startsWith("-") || value.includes("\0")) {
    throw new Error(`${label} is invalid`)
  }
  return value
}

/** stash 只按序号寻址，构造 `stash@{n}` 前先确认它真的是自然数。 */
function stashRef(payload: Record<string, unknown>): string {
  const value = payload.index
  const index = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10)
  if (!Number.isInteger(index) || index < 0) throw new Error("stash index is invalid")
  return `stash@{${String(index)}}`
}

/**
 * 归一化调用方给出的路径集合：既接受 `path` 单值也接受 `paths` 数组，统一转成
 * 相对仓库根的正斜杠路径，任何逃出仓库的路径都会被拒绝。
 */
function safePaths(root: string, payload: Record<string, unknown>): string[] {
  const raw = payload.paths
  const list = Array.isArray(raw)
    ? raw.filter((item): item is string => typeof item === "string")
    : [textField(payload, "path")].filter((item): item is string => item !== undefined)
  return list.map(item => {
    if (item.includes("\0")) throw new Error("path is invalid")
    const absolute = isAbsolute(item) ? resolve(item) : resolve(root, item)
    // pathe emits forward-slash output, so a single posix check suffices.
    const rel = relative(root, absolute)
    if (rel === "" || rel === ".." || rel.startsWith("../") || isAbsolute(rel)) {
      throw new Error("path is outside the repository")
    }
    return rel
  })
}

/** 至少要有一个目标，否则批量命令会静默作用于整个仓库。 */
function requirePaths(root: string, payload: Record<string, unknown>): string[] {
  const paths = safePaths(root, payload)
  if (paths.length === 0) throw new Error("at least one path is required")
  return paths
}

async function repoRoot(cwd: string): Promise<string | undefined> {
  const root = await probe(cwd, ["rev-parse", "--show-toplevel"])
  return root === undefined || root === "" ? undefined : resolve(root)
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch { return false }
}

/** 未完成的多步操作，决定 UI 是否显示“中止合并”一类的出口。 */
async function pendingOperation(cwd: string): Promise<GitOperation | undefined> {
  const gitDir = await probe(cwd, ["rev-parse", "--absolute-git-dir"])
  if (gitDir === undefined) return undefined
  if (await fileExists(join(gitDir, "MERGE_HEAD"))) return "merge"
  if (await fileExists(join(gitDir, "CHERRY_PICK_HEAD"))) return "cherry-pick"
  if (await fileExists(join(gitDir, "REVERT_HEAD"))) return "revert"
  if (await fileExists(join(gitDir, "rebase-merge")) || await fileExists(join(gitDir, "rebase-apply"))) return "rebase"
  return undefined
}

async function status(cwd: string) {
  const root = await repoRoot(cwd)
  if (root === undefined) return { isRepo: false as const, files: [] }
  const [raw, remotes, stashes, operation] = await Promise.all([
    run(root, ["status", "--porcelain=v2", "--branch", "-z", "--untracked-files=all"]).then(result => result.stdout),
    probe(root, ["remote"]),
    probe(root, ["stash", "list", "--format=%gd"]),
    pendingOperation(root),
  ])
  const parsed = parseStatus(raw)
  return {
    isRepo: true as const,
    root,
    ...parsed,
    hasRemote: (remotes ?? "") !== "",
    stashCount: (stashes ?? "").split("\n").filter(line => line !== "").length,
    ...(operation === undefined ? {} : { operation }),
  }
}

/**
 * 单个文件的统一 diff。未跟踪文件在索引里没有对手方，用 `--no-index` 与空设备
 * 比对才能得到完整的新增内容；该形式在有差异时以退出码 1 结束，属于正常结果。
 */
async function diff(root: string, payload: Record<string, unknown>) {
  const [path] = requirePaths(root, payload)
  if (path === undefined) throw new Error("a path is required")
  const group = textField(payload, "group") as GitGroup | undefined
  const base = ["diff", "--no-color", "--patch"]
  if (group === "untracked") {
    // --no-index 用退出码表达“有差异”，因此把它的失败当成正常产出读取。
    const patch = await exec("git", ["-C", root, "--no-pager", ...base, "--no-index", "--", "/dev/null", path], { maxBuffer: MAX_OUTPUT_BYTES })
      .then(result => result.stdout)
      .catch((error: unknown) => typeof error === "object" && error !== null && "stdout" in error ? String(error.stdout) : "")
    return { path, patch, ...countDiffLines(patch) }
  }
  const args = group === "index" ? [...base, "--cached", "--", path] : [...base, "--", path]
  const patch = (await run(root, args)).stdout
  return { path, patch, ...countDiffLines(patch) }
}

/**
 * 丢弃改动。三种分组的“丢弃”是三条不同的命令：未跟踪文件要删掉，已暂存的要
 * 连索引一起还原，只改了工作区的还原工作区即可。
 */
async function discard(root: string, payload: Record<string, unknown>) {
  const paths = requirePaths(root, payload)
  const group = textField(payload, "group") as GitGroup | undefined
  if (group === "untracked") {
    await run(root, ["clean", "-f", "-d", "--", ...paths])
    return { ok: true }
  }
  const args = group === "index" ? ["restore", "--staged", "--worktree"] : ["restore"]
  await run(root, [...args, "--", ...paths])
  return { ok: true }
}

/** 一键清空工作区：还原全部已跟踪改动，再删掉未跟踪文件与空目录。 */
async function discardAll(root: string, files: readonly GitFile[]) {
  const tracked = files.filter(file => file.group !== "untracked")
  if (tracked.length > 0) await run(root, ["restore", "--staged", "--worktree", "--", "."])
  if (files.some(file => file.group === "untracked")) await run(root, ["clean", "-f", "-d"])
  return { ok: true }
}

function commitArgs(payload: Record<string, unknown>): string[] {
  const message = textField(payload, "message")
  const amend = flag(payload, "amend")
  if (message === undefined && !amend) throw new Error("commit message is required")
  return [
    "commit",
    ...(amend ? ["--amend"] : []),
    ...(flag(payload, "signoff") ? ["--signoff"] : []),
    ...(flag(payload, "all") ? ["--all"] : []),
    ...(message === undefined ? ["--no-edit"] : ["-m", message]),
  ]
}

/**
 * 推送。没有上游的分支第一次推送要自己建立跟踪关系，否则 git 会以“没有配置
 * 上游”失败——这正是新建分支后最常撞上的一堵墙。
 */
async function push(root: string, payload: Record<string, unknown>) {
  const current = await status(root)
  const args = ["push"]
  if (flag(payload, "force")) args.push("--force-with-lease")
  if (current.isRepo && current.upstream === undefined && !current.detached) {
    args.push("--set-upstream", "origin", current.branch)
  }
  return { ...await run(root, args), ok: true }
}

/** 同步：先拉后推，与 VS Code 状态栏的同步按钮语义一致。 */
async function sync(root: string, payload: Record<string, unknown>) {
  await run(root, ["pull", ...(flag(payload, "rebase") ? ["--rebase"] : [])])
  await push(root, {})
  return { ok: true }
}

async function branches(root: string) {
  // for-each-ref 的格式串用 %<hex> 转义字面字符，`%x1f` 那套只属于 git log。
  const local = await run(root, ["branch", "--format=%(refname:short)%1f%(upstream:short)%1f%(HEAD)"])
  const remote = await probe(root, ["branch", "--remotes", "--format=%(refname:short)"])
  return {
    local: local.stdout.split("\n").filter(line => line !== "").map(line => {
      const [name, upstream, head] = line.split("\x1f")
      return {
        name: name ?? "",
        ...(upstream === undefined || upstream === "" ? {} : { upstream }),
        current: head === "*",
      }
    }),
    // `origin/HEAD` 的短名就是远端名本身，不带斜杠，它是符号引用而非分支。
    remote: (remote ?? "").split("\n").filter(line => line.includes("/")),
  }
}

/** 把路径追加进 .gitignore，已经在里面的行不重复写入。 */
async function ignore(root: string, payload: Record<string, unknown>) {
  const paths = requirePaths(root, payload)
  const file = join(root, ".gitignore")
  const current = await readFile(file, "utf8").catch(() => "")
  const existing = new Set(current.split("\n").map(line => line.trim()))
  const additions = paths.filter(path => !existing.has(path))
  if (additions.length === 0) return { added: 0 }
  const prefix = current === "" || current.endsWith("\n") ? "" : "\n"
  await appendFile(file, `${prefix}${additions.join("\n")}\n`, "utf8")
  return { added: additions.length }
}

/**
 * 生成提交消息的素材：暂存区非空时就是它，因为那正是即将提交的内容；否则退回
 * 已跟踪文件的工作区改动，与「未暂存时直接提交全部」的行为对齐。未跟踪文件两
 * 种路径都提交不到，所以也不参与描述。
 */
async function commitDiff(root: string): Promise<string> {
  const patch = ["diff", "--no-color", "--patch"]
  const staged = (await run(root, [...patch, "--cached"])).stdout
  if (staged.trim() !== "") return staged
  return (await run(root, patch)).stdout
}

async function generateMessage(ctx: WorkbenchContext, root: string) {
  const llm = ctx.get("llm")
  if (llm === undefined) throw new Error("the model runtime is not available")
  const source = await commitDiff(root)
  if (source.trim() === "") throw new Error("there are no changes to describe")
  const route = await resolveCommitRoute(llm, readCommitSettings(ctx))
  return { message: await generateCommitMessage(llm, route, truncateDiff(source)), ...route }
}

/** 设置界面要的三样东西：可选模型、当前选择、以及这次实际会打到哪。 */
async function commitModels(ctx: WorkbenchContext) {
  const llm = ctx.get("llm")
  const configured = readCommitSettings(ctx)
  const writable = ctx.get("settings")?.writable ?? false
  if (llm === undefined) return { options: [], configured, writable }
  const [options, resolved] = await Promise.all([
    listModelOptions(llm),
    resolveCommitRoute(llm, configured).catch(() => undefined),
  ])
  return { options, configured, writable, ...(resolved === undefined ? {} : { resolved }) }
}

/** 需要仓库上下文的方法在此统一拿到仓库根，未初始化时给出可执行的提示。 */
async function withRoot(cwd: string): Promise<string> {
  const root = await repoRoot(cwd)
  if (root === undefined) throw new Error("this workspace is not a Git repository")
  return root
}

/**
 * 处理一个 `git.*` 方法。返回 `undefined` 表示该方法不属于 Git，交回调用方
 * 继续匹配。
 */
export async function gitDispatch(
  ctx: WorkbenchContext,
  method: string,
  payload: Record<string, unknown>,
): Promise<unknown> {
  const cwd = resolveSessionCwd(ctx, textField(payload, "sessionId"), textField(payload, "cwd"))
  if (method === "git.status") return status(cwd)
  if (method === "git.init") return { ...await run(cwd, ["init"]), ok: true }
  // 模型选择属于全局偏好，不依赖当前工作区是不是仓库。
  if (method === "git.models") return commitModels(ctx)
  if (method === "git.selectModel") {
    return {
      configured: await writeCommitSettings(ctx, {
        provider: textField(payload, "provider") ?? "",
        model: textField(payload, "model") ?? "",
      }),
    }
  }

  const root = await withRoot(cwd)
  switch (method) {
    case "git.generateMessage": return generateMessage(ctx, root)
    case "git.diff": return diff(root, payload)
    case "git.stage": return { ...await run(root, ["add", "--", ...requirePaths(root, payload)]), ok: true }
    case "git.unstage": return { ...await run(root, ["restore", "--staged", "--", ...requirePaths(root, payload)]), ok: true }
    case "git.discard": return discard(root, payload)
    case "git.stageAll": return { ...await run(root, ["add", "--all"]), ok: true }
    case "git.unstageAll": return { ...await run(root, ["reset", "--mixed"]), ok: true }
    case "git.discardAll": {
      const current = await status(root)
      return discardAll(root, current.isRepo ? current.files : [])
    }
    case "git.commit": return { ...await run(root, commitArgs(payload)), ok: true }
    case "git.push": return push(root, payload)
    case "git.pull": return { ...await run(root, ["pull", ...(flag(payload, "rebase") ? ["--rebase"] : [])]), ok: true }
    case "git.fetch": return { ...await run(root, ["fetch", ...(flag(payload, "all") ? ["--all"] : []), "--prune"]), ok: true }
    case "git.sync": return sync(root, payload)
    case "git.log": {
      const limit = Number.parseInt(String(payload.limit ?? DEFAULT_LOG_LIMIT), 10)
      const count = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 500) : DEFAULT_LOG_LIMIT
      const raw = await run(root, ["log", `-n${String(count)}`, "--date=short", "--format=%H%x1f%h%x1f%an%x1f%ad%x1f%s%x1f%D%x00"])
      return { commits: parseLog(raw.stdout) }
    }
    case "git.branches": return branches(root)
    case "git.checkout": {
      const branch = safeValue(textField(payload, "branch"), "branch")
      const create = flag(payload, "create")
      const start = textField(payload, "startPoint")
      return {
        ...await run(root, ["checkout", ...(create ? ["-b"] : []), branch, ...(create && start !== undefined ? [safeValue(start, "startPoint")] : [])]),
        ok: true,
      }
    }
    case "git.branchDelete": {
      const branch = safeValue(textField(payload, "branch"), "branch")
      return { ...await run(root, ["branch", flag(payload, "force") ? "-D" : "-d", branch]), ok: true }
    }
    case "git.stashList": return { stashes: parseStashes((await run(root, ["stash", "list", "--format=%gd%x1f%gs"])).stdout) }
    case "git.stashPush": {
      const label = textField(payload, "message")
      return {
        ...await run(root, [
          "stash", "push",
          ...(flag(payload, "includeUntracked") ? ["--include-untracked"] : []),
          ...(label === undefined ? [] : ["--message", label]),
        ]),
        ok: true,
      }
    }
    case "git.stashPop": return { ...await run(root, ["stash", "pop", stashRef(payload)]), ok: true }
    case "git.stashApply": return { ...await run(root, ["stash", "apply", stashRef(payload)]), ok: true }
    case "git.stashDrop": return { ...await run(root, ["stash", "drop", stashRef(payload)]), ok: true }
    case "git.ignore": return ignore(root, payload)
    case "git.mergeAbort": return { ...await run(root, ["merge", "--abort"]), ok: true }
    case "git.revert": return { ...await run(root, ["revert", "--no-edit", safeValue(textField(payload, "commit"), "commit")]), ok: true }
    case "git.cherryPick": return { ...await run(root, ["cherry-pick", safeValue(textField(payload, "commit"), "commit")]), ok: true }
    default: throw Object.assign(new Error(`unknown git method: ${method}`), { status: 404 })
  }
}
