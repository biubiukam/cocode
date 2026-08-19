/**
 * 设置页里的一行：选择生成提交消息用哪个模型。
 *
 * 面板与这一行都在 slot 注入通道之外渲染，所以同样走模块级 `t()`，并订阅
 * locale 修订号跟随语言切换。
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from "react"
import { Menu } from "@deepseek-ai/dsh-client-ui-primitives"
import { gitRequest, type CommitModelOption, type CommitModels } from "./git-client.ts"
import { SectionChevron } from "./git-icons.tsx"
import { localeRevision, subscribeLocale, t } from "./locales.ts"
import css from "./settings-row.module.css"

/** 「自动」选项的菜单标识；provider 与 model 都留空即交由后端挑选。 */
const AUTO = "auto"

function optionId(option: CommitModelOption): string {
  return `${option.provider}/${option.model}`
}

function optionLabel(option: CommitModelOption): string {
  return `${option.modelName} · ${option.providerName}`
}

export function CommitModelRow() {
  useSyncExternalStore(subscribeLocale, localeRevision, localeRevision)
  const [models, setModels] = useState<CommitModels>()
  const [error, setError] = useState<string>()
  const [open, setOpen] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    try {
      setModels(await gitRequest<CommitModels>("git.models", {}))
      setError(undefined)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [])

  useEffect(() => {
    const refreshAfterRuntimeRecovery = (): void => { void load() }
    void load()
    window.addEventListener("cocode:dsh-runtime-rebound", refreshAfterRuntimeRecovery)
    return () => window.removeEventListener("cocode:dsh-runtime-rebound", refreshAfterRuntimeRecovery)
  }, [load])

  const select = async (id: string): Promise<void> => {
    const option = models?.options.find(candidate => optionId(candidate) === id)
    try {
      await gitRequest("git.selectModel", option === undefined
        ? { provider: "", model: "" }
        : { provider: option.provider, model: option.model })
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  const options = models?.options ?? []
  const configured = models?.configured
  // 保存的是「自动」时，把实际解析出的模型显示在描述里，用户才知道会打到哪。
  const isAuto = configured === undefined || configured.provider === "" || configured.model === ""
  const current = isAuto ? undefined : options.find(option =>
    option.provider === configured.provider && option.model === configured.model)
  const resolved = models?.resolved
  const hint = error ?? (options.length === 0
    ? t("settings.noModel")
    : models?.writable === false
      ? t("settings.readOnly")
      : isAuto && resolved !== undefined
        ? t("settings.commitModelResolved", { model: resolved.model })
        : t("settings.commitModelHint"))

  return <div className={css.row}>
    <div className={css.text}>
      <div className={css.title}>{t("settings.commitModel")}</div>
      <div className={css.hint} data-error={error === undefined ? undefined : true}>{hint}</div>
    </div>
    <Menu
      open={open}
      onClose={() => setOpen(false)}
      items={[
        { id: AUTO, label: t("settings.commitModelAuto") },
        ...options.map(option => ({ id: optionId(option), label: optionLabel(option) })),
      ]}
      selectedId={current === undefined ? AUTO : optionId(current)}
      onSelect={id => { setOpen(false); void select(id) }}
      align="end"
      portal
      anchor={<button
        type="button"
        className={css.selector}
        disabled={options.length === 0 || models?.writable === false}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
      >
        {current === undefined ? t("settings.commitModelAuto") : optionLabel(current)}
        <SectionChevron size={12} className={css.chevron} />
      </button>}
    />
  </div>
}
