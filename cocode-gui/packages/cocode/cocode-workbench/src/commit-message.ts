/**
 * 提交消息生成。把待提交的差异交给一个轻量模型，换回一条可以直接提交的消息。
 *
 * 这里走的是 harness 的一次性补全路径（`ctx.llm.stream` + {@link BlockAssembler}），
 * 不进 agent loop、不写会话日志：它是用户按下按钮换来的一次工具调用，不该出现在
 * 对话历史里。
 */
import { BlockAssembler, createUserMessage, type LlmRuntime } from "@deepseek-ai/dsh-llm"
import { DEFAULT_COMMIT_MODEL, type CommitMessageSettings } from "./settings.ts"

/** 差异体量上限。超出的部分对写一行标题没有增量信息，却会顶满上下文窗口。 */
const MAX_DIFF_CHARS = 24_000
const MAX_OUTPUT_TOKENS = 512
/** 生成超时。用户在等一个输入框被填上，拖过这个时长不如让他自己写。 */
const TIMEOUT_MS = 45_000

const SYSTEM_PROMPT = [
  "You write git commit messages from a diff.",
  "",
  "Rules:",
  "- Follow Conventional Commits: `type(scope): subject`.",
  "- type is one of: feat, fix, refactor, perf, docs, style, test, build, ci, chore.",
  "- The scope is optional. Use it only when the change clearly belongs to one area.",
  "- The subject is imperative, lower case, has no trailing period, and stays under 72 characters.",
  "- Describe why the change was made, not which lines moved. Never list file names.",
  "- When one line cannot carry the change, add a blank line and at most three `- ` bullets.",
  "- Answer with the commit message only: no code fences, no quotes, no preamble.",
].join("\n")

export interface ModelRoute {
  readonly provider: string
  readonly model: string
}

export interface ModelOption extends ModelRoute {
  readonly providerName: string
  readonly modelName: string
}

/** 目录里所有可选模型，供设置界面渲染成一个下拉。 */
export async function listModelOptions(llm: LlmRuntime): Promise<readonly ModelOption[]> {
  const catalog = await catalogOf(llm)
  return catalog.flatMap(entry => entry.models.map(model => ({
    provider: entry.provider,
    providerName: entry.providerName,
    model: model.id,
    modelName: model.name ?? model.id,
  })))
}

/**
 * 决定这次请求实际打到哪个模型：用户指定的优先，其次是默认模型在任意 provider 上
 * 的落点，最后退到目录里的第一个模型。三级回退保证换了登录方式也不会失灵。
 */
export async function resolveCommitRoute(
  llm: LlmRuntime,
  configured: CommitMessageSettings,
): Promise<ModelRoute> {
  const wanted = configured.model.trim() === "" ? DEFAULT_COMMIT_MODEL : configured.model.trim()
  const preferred = configured.provider.trim()
  const catalog = await catalogOf(llm)
  if (catalog.length === 0) throw new Error("no model provider is configured")

  const has = (provider: string, model: string): boolean =>
    catalog.some(entry => entry.provider === provider && entry.models.some(item => item.id === model))
  // provider 与 model 都指明且确实存在时照办；模型目录只是 advisory，找不到就继续回退。
  if (preferred !== "" && has(preferred, wanted)) return { provider: preferred, model: wanted }

  const carrier = catalog.find(entry => entry.models.some(item => item.id === wanted))
  if (carrier !== undefined) return { provider: carrier.provider, model: wanted }

  const first = catalog.find(entry => entry.models.length > 0)
  const fallback = first?.models[0]
  if (first === undefined || fallback === undefined) throw new Error("no model is available")
  return { provider: first.provider, model: fallback.id }
}

/**
 * 生成一条提交消息。
 * @param diff - 已经裁剪过的统一差异文本。
 */
export async function generateCommitMessage(
  llm: LlmRuntime,
  route: ModelRoute,
  diff: string,
  signal?: AbortSignal,
): Promise<string> {
  const deadline = AbortSignal.timeout(TIMEOUT_MS)
  const assembler = new BlockAssembler()
  for await (const chunk of llm.stream({
    provider: route.provider,
    model: route.model,
    system: SYSTEM_PROMPT,
    maxTokens: MAX_OUTPUT_TOKENS,
    signal: signal === undefined ? deadline : AbortSignal.any([signal, deadline]),
    messages: [createUserMessage({
      content: [{ type: "text", text: promptOf(diff) }],
      source: { kind: "plugin", plugin: "cocode-workbench" },
    })],
  })) {
    assembler.push(chunk)
  }
  if (assembler.finish.kind !== "stop") {
    throw new Error(`the model stopped early (${assembler.finish.kind})`)
  }
  const text = assembler.blocks()
    .flatMap(block => block.type === "text" ? [block.text] : [])
    .join("")
  const message = clean(text)
  if (message === "") throw new Error("the model returned an empty commit message")
  return message
}

/** 超出上限的差异从中间截断：文件头和末尾的改动同样是判断意图的线索。 */
export function truncateDiff(diff: string): string {
  if (diff.length <= MAX_DIFF_CHARS) return diff
  const half = Math.floor(MAX_DIFF_CHARS / 2)
  return `${diff.slice(0, half)}\n\n... diff truncated ...\n\n${diff.slice(-half)}`
}

function promptOf(diff: string): string {
  return `Write the commit message for this diff.\n\n${diff}`
}

interface CatalogEntry {
  readonly provider: string
  readonly providerName: string
  readonly models: readonly { readonly id: string; readonly name?: string }[]
}

/** 逐个 provider 取模型；某个 provider 探测失败不该让整份目录一起塌掉。 */
async function catalogOf(llm: LlmRuntime): Promise<readonly CatalogEntry[]> {
  return Promise.all(llm.listProviders().map(async provider => ({
    provider: provider.id,
    providerName: provider.name,
    models: await llm.listModels(provider.id).catch(() => []),
  })))
}

/**
 * 去掉模型爱加的外壳：围栏代码块、整体包裹的引号、以及 `Commit message:` 之类的
 * 前言。剩下的原样保留，包括正文里的空行。
 */
function clean(raw: string): string {
  let text = raw.trim()
  const fence = /^```[\w-]*\n([\s\S]*?)\n?```$/.exec(text)
  if (fence?.[1] !== undefined) text = fence[1].trim()
  text = text.replace(/^(?:commit message|message)\s*:\s*/i, "").trim()
  const quoted = /^"([\s\S]+)"$/.exec(text)
  if (quoted?.[1] !== undefined) text = quoted[1].trim()
  return text
}
