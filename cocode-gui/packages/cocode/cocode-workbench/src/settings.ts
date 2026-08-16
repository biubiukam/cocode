/**
 * Workbench 的用户设置。目前只有一项：生成提交消息用哪个模型。
 *
 * 两个字段都允许留空，空值表示「自动」——由 {@link resolveCommitRoute} 在运行时
 * 挑一个能用的路由。这样默认配置不绑死在某个具体 provider 上：同一个模型可能来自
 * 官方直连，也可能来自账号代理，用户换登录方式时设置不需要跟着改。
 */
import z from "schemastery"
import type { WorkbenchContext } from "./host-types.ts"

export const WORKBENCH_SETTINGS_NAMESPACE = "cocode-workbench"

/**
 * 默认的提交消息模型。选轻量档是因为写一行标题不值得动用推理模型，延迟和成本
 * 都要低一个量级。provider 留空即「任意提供该模型的 provider」。
 */
export const DEFAULT_COMMIT_MODEL = "deepseek-v4-flash"

export const WorkbenchSettingsSchema = z.object({
  commitMessage: z.object({
    provider: z.string().default(""),
    model: z.string().default(DEFAULT_COMMIT_MODEL),
  }).default({ provider: "", model: DEFAULT_COMMIT_MODEL }),
})

export interface CommitMessageSettings {
  readonly provider: string
  readonly model: string
}

export interface WorkbenchSettings {
  readonly commitMessage: CommitMessageSettings
}

const DEFAULTS: CommitMessageSettings = { provider: "", model: DEFAULT_COMMIT_MODEL }

/** 注册命名空间。settings 服务缺席时整个功能退化为默认值，不影响其余面板。 */
export function registerWorkbenchSettings(ctx: WorkbenchContext): void {
  ctx.inject(["settings"], scoped => {
    scoped.settings.register(WORKBENCH_SETTINGS_NAMESPACE, WorkbenchSettingsSchema)
  })
}

/** 读取当前的提交消息模型选择；任何缺失都退回默认值。 */
export function readCommitSettings(ctx: WorkbenchContext): CommitMessageSettings {
  const section = describe(ctx)?.value
  if (typeof section !== "object" || section === null) return DEFAULTS
  const value = (section as { commitMessage?: unknown }).commitMessage
  if (typeof value !== "object" || value === null) return DEFAULTS
  const { provider, model } = value as Partial<CommitMessageSettings>
  return {
    provider: typeof provider === "string" ? provider : DEFAULTS.provider,
    model: typeof model === "string" && model !== "" ? model : DEFAULTS.model,
  }
}

/** 写入模型选择。写入需要 settings 文档可写，只读时明确报错而不是静默丢弃。 */
export async function writeCommitSettings(
  ctx: WorkbenchContext,
  next: CommitMessageSettings,
): Promise<CommitMessageSettings> {
  const settings = ctx.get("settings")
  const current = describe(ctx)
  if (settings === undefined || current === undefined) {
    throw new Error("the settings service is not available")
  }
  if (!settings.writable) throw new Error("the settings document is read-only")
  await settings.update(WORKBENCH_SETTINGS_NAMESPACE, { commitMessage: next }, current.revision)
  return readCommitSettings(ctx)
}

function describe(ctx: WorkbenchContext) {
  return ctx.get("settings")
    ?.describe({ redactSecrets: true })
    .find(candidate => candidate.ns === WORKBENCH_SETTINGS_NAMESPACE)
}
