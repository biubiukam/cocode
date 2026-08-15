import { createElement, useEffect, useRef, useState, useSyncExternalStore } from "react"
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client"
import type { ConfigurableProviderView, ConnectionHandle } from "@deepseek-ai/dsh-api-remotes/client"
import type {} from "@deepseek-ai/dsh-api-remotes/client"
import {
  IconApiOutline14,
  IconChevronUpOutline14,
  IconUserOutline16,
  Menu,
  type MenuEntry,
} from "@deepseek-ai/dsh-client-ui-primitives"
import css from "./account.module.css"

type AccountSnapshot = {
  phase: "signed-out" | "signing-in" | "provisioning" | "signed-in" | "error"
  profile: { displayName: string; email?: string } | null
  cloud: { status: "absent" | "ready" | "conflict" | "error"; providerId: "cocode-cloud" }
  usage?: { fiveHour?: number; week?: number; month?: number }
  error?: { code: string; message: string }
}

type DesktopAccountApi = {
  snapshot(): Promise<AccountSnapshot>
  signIn(): Promise<AccountSnapshot>
  signOut(): Promise<void>
  onChanged(listener: (snapshot: AccountSnapshot) => void): () => void
}

declare global {
  interface Window {
    readonly desktopApi?: { readonly account?: DesktopAccountApi }
  }
}

type ProviderSummary = { readonly id: string; readonly name: string }

type AccountProps = {
  readonly wide: boolean
  readonly store: AccountStore
  readonly providers: ProviderStore
}

type AccountPanelKind = "usage" | "help"

type OnboardingProps = {
  readonly complete: () => void
  readonly openSection: (id: string) => void
  readonly store: AccountStore
}

const EMPTY: AccountSnapshot = {
  phase: "signed-out",
  profile: null,
  cloud: { status: "absent", providerId: "cocode-cloud" },
}

const COPY = {
  zh: {
    signIn: "登录 Cocode",
    signInTitle: "登录 Cocode 账号",
    signOutTitle: "退出 Cocode 账号",
    waiting: "等待浏览器登录…",
    provisioning: "配置 Cocode Cloud…",
    retry: "重试 Cocode",
    browserHint: "请在系统浏览器中完成 Cocode 授权。",
    provisioningHint: "正在为当前账号配置 Cocode Cloud 模型。",
    intro: "登录 Cocode 后即可使用账号可用的云模型，也不会改变已有默认模型。",
    later: "稍后配置",
    conflict: "本机已有同名 Provider 或凭证，请先在模型设置中处理冲突。",
    cleanupPending: "本地账号已退出，Cocode Cloud 配置将在运行时恢复后继续清理。",
    reauthentication: "请在浏览器中重新认证 Cocode 账号（十分钟内完成），然后点击重试。",
    account: "Cocode 账号",
    accountPlan: "账户与计划",
    planUsage: "套餐用量",
    customProvider: "自定义 Provider",
    noProvider: "登录或配置 Provider",
    models: "模型与 Provider",
    settings: "设置",
    help: "帮助与反馈",
    signOut: "退出登录",
    providerId: "Provider ID：",
  },
  en: {
    signIn: "Sign in to Cocode",
    signInTitle: "Sign in to your Cocode account",
    signOutTitle: "Sign out of your Cocode account",
    waiting: "Waiting for browser sign-in…",
    provisioning: "Configuring Cocode Cloud…",
    retry: "Retry Cocode",
    browserHint: "Complete Cocode authorization in your system browser.",
    provisioningHint: "Configuring Cocode Cloud models for this account.",
    intro: "Sign in to use the cloud models available to your account without changing the existing default model.",
    later: "Configure later",
    conflict: "A provider or credential with the reserved Cocode name already exists. Resolve it in Models settings first.",
    cleanupPending: "The local account is signed out. Cloud configuration cleanup will resume when the runtime is available.",
    reauthentication: "Reauthenticate your Cocode account in the browser within ten minutes, then retry.",
    account: "Cocode account",
    accountPlan: "Account & plan",
    planUsage: "Plan usage",
    customProvider: "Custom provider",
    noProvider: "Sign in or configure a provider",
    models: "Models & providers",
    settings: "Settings",
    help: "Help & feedback",
    signOut: "Sign out",
    providerId: "Provider ID: ",
  },
} as const

/** Stable DOM hook owned by the settings shell's trigger. */
const SETTINGS_TRIGGER = "[data-dsh-settings-trigger]"

function copy(): typeof COPY.zh | typeof COPY.en {
  return document.documentElement.lang.toLowerCase().startsWith("zh") || navigator.language.toLowerCase().startsWith("zh")
    ? COPY.zh
    : COPY.en
}

class AccountStore {
  private snapshot = EMPTY
  private listeners = new Set<() => void>()
  private off: (() => void) | undefined
  private busy = false

  getSnapshot = (): AccountSnapshot => this.snapshot

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    this.start()
    return () => this.listeners.delete(listener)
  }

  async activate(): Promise<void> {
    if (this.busy) return
    const account = window.desktopApi?.account
    if (account === undefined) return
    this.busy = true
    try {
      this.set(await account.signIn())
    } catch (error) {
      this.set({ ...this.snapshot, phase: "error", error: { code: "sign-in-failed", message: safeMessage(error) } })
    } finally {
      this.busy = false
    }
  }

  async retry(): Promise<void> {
    if (this.snapshot.error?.code !== "cleanup-pending") {
      await this.activate()
      return
    }
    if (this.busy) return
    const account = window.desktopApi?.account
    if (account === undefined) return
    this.busy = true
    try {
      await account.signOut()
      this.set(await account.snapshot())
    } catch (error) {
      this.set({ ...this.snapshot, phase: "error", error: { code: "cleanup-pending", message: safeMessage(error) } })
    } finally {
      this.busy = false
    }
  }

  async deactivate(): Promise<void> {
    if (this.busy) return
    const account = window.desktopApi?.account
    if (account === undefined) return
    this.busy = true
    try {
      await account.signOut()
      this.set(await account.snapshot())
    } catch (error) {
      this.set({ ...this.snapshot, phase: "error", error: { code: "sign-out-failed", message: safeMessage(error) } })
    } finally {
      this.busy = false
    }
  }

  dispose(): void {
    this.off?.()
    this.off = undefined
    this.listeners.clear()
  }

  private start(): void {
    if (this.off !== undefined) return
    const account = window.desktopApi?.account
    if (account === undefined) return
    this.off = account.onChanged(snapshot => this.set(snapshot))
    void account.snapshot().then(snapshot => this.set(snapshot), error => {
      this.set({ ...EMPTY, phase: "error", error: { code: "account-unavailable", message: safeMessage(error) } })
    })
  }

  private set(snapshot: AccountSnapshot): void {
    this.snapshot = snapshot
    for (const listener of [...this.listeners]) listener()
  }
}

class ProviderStore {
  private snapshot: ProviderSummary | null = null
  private providers: readonly ConfigurableProviderView[] = []
  private listeners = new Set<() => void>()
  private generation = 0

  constructor(private readonly connection: ConnectionHandle) {}

  getSnapshot = (): ProviderSummary | null => this.snapshot

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  refreshSelection(): void {
    this.publish(this.select(this.providers))
  }

  async load(): Promise<void> {
    const generation = ++this.generation
    try {
      const response = await this.connection.api.llm.providers({})
      if (!response.result.ok || generation !== this.generation) return
      this.providers = response.result.value.providers
      this.publish(this.select(this.providers))
    } catch {
      // Keep the last confirmed provider while the runtime reconnects.
    }
  }

  private select(providers: readonly ConfigurableProviderView[]): ProviderSummary | null {
    const local = providers.filter(provider => provider.provider !== "cocode-cloud" && provider.active)
    const preferred = this.connection.hostDescription.getSnapshot()?.provider
    const provider = local.find(candidate => candidate.provider === preferred) ?? local[0]
    return provider === undefined ? null : { id: provider.provider, name: provider.displayName }
  }

  private publish(next: ProviderSummary | null): void {
    if (this.snapshot?.id === next?.id && this.snapshot?.name === next?.name) return
    this.snapshot = next
    for (const listener of [...this.listeners]) listener()
  }
}

function safeMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/ck_[A-Za-z0-9_-]+/g, "[redacted]")
}

function labelOf(snapshot: AccountSnapshot, wide: boolean): string {
  const t = copy()
  if (!wide) return snapshot.phase === "signed-in" ? "C" : t.signIn
  if (snapshot.phase === "signed-in") return snapshot.profile?.displayName ?? "Cocode"
  if (snapshot.phase === "signing-in") return t.waiting
  if (snapshot.phase === "provisioning") return t.provisioning
  if (snapshot.phase === "error") return t.retry
  return t.signIn
}

function accountError(snapshot: AccountSnapshot): string | undefined {
  const t = copy()
  if (snapshot.error?.code === "cloud-provider-conflict") return t.conflict
  if (snapshot.error?.code === "cleanup-pending") return t.cleanupPending
  if (snapshot.error?.code === "reauthentication-required") return t.reauthentication
  return snapshot.error?.message
}

function AccountOnboarding({ complete, openSection, store }: OnboardingProps): ReactNode {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const t = copy()
  const completed = useRef(false)
  useEffect(() => {
    if (snapshot.phase === "signed-in" && !completed.current) {
      completed.current = true
      complete()
    }
  }, [complete, snapshot.phase])
  if (snapshot.phase === "signed-in") {
    return null
  }
  const busy = snapshot.phase === "signing-in" || snapshot.phase === "provisioning"
  const message = snapshot.phase === "signing-in"
    ? t.browserHint
    : snapshot.phase === "provisioning"
      ? t.provisioningHint
      : t.intro
  return createElement(
    "div",
    {
      role: "dialog",
      "aria-modal": "true",
      style: {
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "grid",
        placeItems: "center",
        padding: "24px",
        background: "rgba(0, 0, 0, .35)",
      },
    },
    createElement(
      "div",
      {
        style: {
          width: "min(420px, 100%)",
          padding: "24px",
          borderRadius: "14px",
          background: "var(--dsw-alias-bg-l1, Canvas)",
          color: "var(--dsw-alias-label-primary, CanvasText)",
          boxShadow: "0 20px 60px rgba(0, 0, 0, .22)",
        },
      },
      createElement("h2", { style: { margin: "0 0 10px", fontSize: "18px" } }, t.signIn),
      createElement("p", { style: { margin: "0 0 18px", lineHeight: 1.5 } }, message),
      snapshot.error === undefined ? null : createElement("p", { role: "alert", style: { color: "#c33", margin: "0 0 12px" } }, accountError(snapshot)),
      createElement(
        "div",
        { style: { display: "flex", gap: "8px", justifyContent: "flex-end" } },
        createElement("button", { type: "button", onClick: () => { openSection("models"); complete() }, disabled: busy }, t.later),
        createElement("button", { type: "button", onClick: () => { void store.retry() }, disabled: busy }, busy ? t.waiting : t.signIn),
      ),
    ),
  )
}

function requestSettings(sectionId?: string): void {
  const trigger = document.querySelector<HTMLButtonElement>(SETTINGS_TRIGGER)
  if (trigger === null) return
  if (sectionId === undefined) delete trigger.dataset.dshSettingsSectionRequest
  else trigger.dataset.dshSettingsSectionRequest = sectionId
  trigger.click()
}

function initialOf(value: string): string {
  return [...value.trim()][0]?.toUpperCase() ?? "C"
}

const ACCOUNT_CENTER_URL = "https://cocode.agency/account"

function openAccountCenter(): void {
  window.open(ACCOUNT_CENTER_URL, "_blank", "noopener,noreferrer")
}

function snapshotUsage(snapshot: AccountSnapshot, key: "fiveHour" | "week" | "month"): number | undefined {
  return snapshot.usage?.[key]
}

type MenuGlyphKind = "account" | "usage" | "settings" | "help" | "logout"

function MenuGlyph({ kind }: { readonly kind: MenuGlyphKind }): ReturnType<typeof createElement> {
  const paths: Record<MenuGlyphKind, ReturnType<typeof createElement>> = {
    account: createElement("path", { d: "M3 13.5c.7-1.9 2.5-3 5-3s4.3 1.1 5 3M8 8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" }),
    usage: createElement("path", { d: "M3 13V9.5M6.5 13V6.5M10 13V3M13.5 13V8M2 13.5h12" }),
    settings: createElement("path", { d: "M8 1.75v2M8 12.25v2M1.75 8h2M12.25 8h2M3.58 3.58 5 5M11 11l1.42 1.42M12.42 3.58 11 5M5 11l-1.42 1.42" }),
    help: createElement("path", { d: "M5.9 5.8a2.15 2.15 0 1 1 3.65 1.54c-.9.78-1.55 1.15-1.55 2.16M8 12.25v.1" }),
    logout: createElement("path", { d: "M8.5 3H4.25A1.25 1.25 0 0 0 3 4.25v7.5A1.25 1.25 0 0 0 4.25 13H8.5M9 8h5M11.5 5.5 14 8l-2.5 2.5" }),
  }
  return createElement("svg", { className: css.menuGlyph, viewBox: "0 0 16 16", width: 16, height: 16, fill: "none", stroke: "currentColor", "stroke-width": 1.6, "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": true }, paths[kind])
}

function AccountPanel({ kind, snapshot, provider, onClose }: {
  readonly kind: AccountPanelKind
  readonly snapshot: AccountSnapshot
  readonly provider: ProviderSummary | null
  readonly onClose: () => void
}): ReturnType<typeof createElement> {
  const t = copy()
  const title = kind === "usage" ? t.planUsage : t.help
  const usageMetric = (label: string, value: number | undefined): ReturnType<typeof createElement> => {
    const percentage = typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : undefined
    return createElement("div", { className: css.usageMetric },
      createElement("div", { className: css.usageMetricHeader },
        createElement("span", { className: css.usageMetricLabel }, label),
        createElement("strong", { className: css.usageMetricPercent }, percentage === undefined ? "—" : `${percentage}%`),
      ),
      createElement("div", { className: css.usageTrack }, createElement("span", { className: css.usageFill, style: { width: `${percentage ?? 0}%` } })),
      createElement("span", { className: css.panelSecondary }, percentage === undefined ? "暂未同步" : "已使用"),
    )
  }
  const body = kind === "usage"
      ? createElement("div", { className: css.panelStack },
          createElement("div", { className: css.planCard },
            createElement("span", { className: css.panelEyebrow }, "当前套餐"),
            createElement("strong", { className: css.planName }, "尚未同步"),
            createElement("span", { className: css.panelSecondary }, "套餐与用量将在账号服务同步后显示"),
          ),
          createElement("div", { className: css.usageGrid },
            usageMetric("5 小时限额", snapshotUsage(snapshot, "fiveHour")),
            usageMetric("周限额", snapshotUsage(snapshot, "week")),
            usageMetric("月限额", snapshotUsage(snapshot, "month")),
          ),
          createElement("p", { className: css.panelHint }, "百分比代表当前周期已使用额度。本地 Provider 的请求不会计入 Cocode Cloud 用量。"),
        )
      : createElement("div", { className: css.panelStack },
          createElement("p", { className: css.panelIntro }, "遇到问题时，可以先查看模型与 Provider 配置，再提交反馈。"),
          createElement("button", { type: "button", className: css.panelAction, onClick: () => { onClose(); requestSettings("models") } }, "打开模型与 Provider"),
          createElement("button", { type: "button", className: css.panelAction, onClick: () => { window.open("https://cocode.agency", "_blank", "noopener,noreferrer") } }, "访问 Cocode 文档"),
          createElement("button", { type: "button", className: css.panelAction, onClick: () => { window.open("mailto:support@cocode.agency?subject=Cocode%20反馈", "_blank") } }, "发送反馈邮件"),
          createElement("p", { className: css.panelHint }, provider === null ? "当前未配置 Provider。" : `当前 Provider：${provider.name}`),
        )
  return createElement("div", { className: css.panelOverlay, role: "presentation", onMouseDown: (event: ReactMouseEvent<HTMLDivElement>) => { if (event.target === event.currentTarget) onClose() } },
    createElement("section", { className: css.panel, role: "dialog", "aria-modal": "true", "aria-label": title },
      createElement("header", { className: css.panelHeader },
        createElement("div", null, createElement("h2", { className: css.panelTitle }, title), createElement("span", { className: css.panelSubtitle }, "Cocode")),
        createElement("button", { type: "button", className: css.panelClose, onClick: onClose, "aria-label": "关闭" }, "×"),
      ),
      body,
    ),
  )
}

function AccountAction({ wide, store, providers }: AccountProps): ReturnType<typeof createElement> {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const provider = useSyncExternalStore(providers.subscribe, providers.getSnapshot, providers.getSnapshot)
  const [open, setOpen] = useState(false)
  const [panel, setPanel] = useState<AccountPanelKind | null>(null)
  const signedIn = snapshot.phase === "signed-in" || snapshot.phase === "provisioning"
  const t = copy()
  const busy = snapshot.phase === "signing-in" || snapshot.phase === "provisioning"
  const primary = signedIn
    ? snapshot.profile?.displayName ?? "Cocode"
    : provider?.name ?? labelOf(snapshot, true)
  const secondary = signedIn ? null : provider === null ? t.noProvider : t.customProvider
  const title = accountError(snapshot) ?? primary
  const entries: MenuEntry[] = signedIn
    ? [
        { id: "account", label: t.accountPlan, icon: createElement(MenuGlyph, { kind: "account" }) },
        { id: "usage", label: t.planUsage, icon: createElement(MenuGlyph, { kind: "usage" }) },
        { type: "separator", id: "account-separator" },
        { id: "settings", label: t.settings, icon: createElement(MenuGlyph, { kind: "settings" }) },
        { id: "help", label: t.help, icon: createElement(MenuGlyph, { kind: "help" }) },
        { id: "sign-out", label: t.signOut, danger: true, icon: createElement(MenuGlyph, { kind: "logout" }) },
      ]
    : provider === null
      ? [
          { type: "label", id: "identity", text: "Cocode" },
          { id: "sign-in", label: t.signIn, icon: createElement(IconUserOutline16, { size: 16 }) },
          { id: "models", label: t.models, icon: createElement(MenuGlyph, { kind: "usage" }) },
          { type: "separator", id: "settings-separator" },
          { id: "settings", label: t.settings, icon: createElement(MenuGlyph, { kind: "settings" }) },
        ]
      : [
          { type: "label", id: "provider", text: provider.name },
          ...(provider.id === provider.name
            ? []
            : [{ type: "label" as const, id: "provider-id", text: `${t.providerId}${provider.id}` }]),
          { type: "separator", id: "provider-separator" },
          { id: "models", label: t.models, icon: createElement(MenuGlyph, { kind: "usage" }) },
          { id: "help", label: t.help, icon: createElement(MenuGlyph, { kind: "help" }) },
          { id: "sign-in", label: t.signIn, icon: createElement(MenuGlyph, { kind: "account" }) },
          { id: "settings", label: t.settings, icon: createElement(MenuGlyph, { kind: "settings" }) },
        ]
  const select = (id: string): void => {
    setOpen(false)
    if (id === "sign-in") void store.activate()
    else if (id === "sign-out") void store.deactivate()
    else if (id === "models") requestSettings("models")
    else if (id === "settings") requestSettings()
    else if (id === "account") openAccountCenter()
    else if (id === "usage" || id === "help") setPanel(id)
  }
  return createElement(
    Menu,
    {
      open,
      side: "top",
      align: "start",
      portal: true,
      dense: true,
      items: entries,
      onClose: () => { setOpen(false) },
      onSelect: select,
      className: css.menuRoot,
      anchor: createElement(
        "button",
        {
          type: "button",
          title,
          className: wide ? css.trigger : `${css.trigger} ${css.rail}`,
          "aria-haspopup": "menu",
          "aria-expanded": open,
          disabled: busy,
          onClick: () => { setOpen(value => !value) },
        },
        createElement(
          "span",
          { className: `${css.avatar} ${signedIn ? css.accountAvatar : provider === null ? css.guestAvatar : css.providerAvatar}` },
          signedIn
            ? initialOf(primary)
            : provider === null
              ? createElement(IconUserOutline16, { size: 18 })
              : createElement(IconApiOutline14, { size: 18 }),
        ),
        wide && createElement(
          "span",
          { className: css.copy },
          createElement("span", { className: css.primary }, primary),
          secondary === null ? null : createElement("span", { className: css.secondary }, secondary),
        ),
        wide && createElement(IconChevronUpOutline14, { className: css.chevron, size: 14 }),
      ),
    },
    panel === null ? null : createElement(AccountPanel, { kind: panel, snapshot, provider, onClose: () => setPanel(null) }),
  )
}

export const inject = ["slots", "connection", "remote"]

export function apply(ctx: ClientContext): void {
  const store = new AccountStore()
  const connection = ctx.get("connection") as ConnectionHandle
  const providers = new ProviderStore(connection)
  ctx.effect(() => () => store.dispose(), "cocode-account: dispose store")
  ctx.effect(() => {
    const refresh = (): void => { void providers.load() }
    const disposers = [
      connection.hostDescription.subscribe(() => { providers.refreshSelection() }),
      ctx.remote.$on("llm/adapters-updated", refresh),
      ctx.remote.$on("settings/document-updated", refresh),
      ctx.remote.$on("credentials/updated", refresh),
      ctx.on("connection/reset", refresh),
    ]
    refresh()
    return () => { for (const dispose of disposers) dispose() }
  }, "cocode-account: provider summary")
  const slots = ctx.slots as unknown as {
    inject(name: string, factory: () => unknown): unknown
    register(options: unknown, component: unknown): unknown
  }
  slots.inject("sidebar.footer.action", () => slots.register({
    name: "sidebar.footer.action",
    id: "cocode-account",
    order: -100,
    inject: () => ({ store, providers }),
  }, AccountAction))
  slots.inject("settings.onboarding", () => slots.register({
    name: "settings.onboarding",
    id: "cocode-account",
    order: -50,
    inject: () => ({ store }),
  }, AccountOnboarding))
}

// Keep the host plugin's default export shape compatible with older loaders.
export function mountStandalone(target: HTMLElement): () => void {
  const store = new AccountStore()
  const providers = new ProviderStore({
    api: { llm: { models: async () => ({ result: { ok: true, value: { groups: [], failures: [] } } }) } },
    hostDescription: { getSnapshot: () => undefined, subscribe: () => () => {} },
  } as unknown as ConnectionHandle)
  let root: Root | undefined
  root = createRoot(target)
  root.render(createElement(AccountAction, { wide: true, store, providers }))
  return () => root?.unmount()
}
