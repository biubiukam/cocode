import { createElement, useEffect, useRef, useState, useSyncExternalStore } from "react"
import type { ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client"
import type { ConfigurableProviderView, ConnectionHandle } from "@deepseek-ai/dsh-api-remotes/client"
import type {} from "@deepseek-ai/dsh-api-remotes/client"
import {
  IconApiOutline14,
  IconChevronUpOutline14,
  IconDataOutline16,
  IconSettingsOutline16,
  IconUserOutline16,
  Menu,
  type MenuEntry,
} from "@deepseek-ai/dsh-client-ui-primitives"
import css from "./account.module.css"

type AccountSnapshot = {
  phase: "signed-out" | "signing-in" | "provisioning" | "signed-in" | "error"
  profile: { displayName: string; email?: string } | null
  cloud: { status: "absent" | "ready" | "conflict" | "error"; providerId: "cocode-cloud" }
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
    customProvider: "自定义 Provider",
    noProvider: "登录或配置 Provider",
    models: "模型与 Provider",
    settings: "设置",
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
    customProvider: "Custom provider",
    noProvider: "Sign in or configure a provider",
    models: "Models & providers",
    settings: "Settings",
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

function AccountAction({ wide, store, providers }: AccountProps): ReturnType<typeof createElement> {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const provider = useSyncExternalStore(providers.subscribe, providers.getSnapshot, providers.getSnapshot)
  const [open, setOpen] = useState(false)
  const signedIn = snapshot.phase === "signed-in" || snapshot.phase === "provisioning"
  const t = copy()
  const busy = snapshot.phase === "signing-in" || snapshot.phase === "provisioning"
  const primary = signedIn
    ? snapshot.profile?.displayName ?? "Cocode"
    : provider?.name ?? labelOf(snapshot, true)
  const secondary = signedIn ? t.account : provider === null ? t.noProvider : t.customProvider
  const title = accountError(snapshot) ?? primary
  const entries: MenuEntry[] = signedIn
    ? [
        { type: "label", id: "identity", text: primary },
        ...(snapshot.profile?.email === undefined
          ? []
          : [{ type: "label" as const, id: "email", text: snapshot.profile.email }]),
        { type: "separator", id: "identity-separator" },
        { id: "settings", label: t.settings, icon: createElement(IconSettingsOutline16, { size: 16 }) },
        { id: "sign-out", label: t.signOut, danger: true, icon: createElement(IconUserOutline16, { size: 16 }) },
      ]
    : provider === null
      ? [
          { type: "label", id: "identity", text: "Cocode" },
          { id: "sign-in", label: t.signIn, icon: createElement(IconUserOutline16, { size: 16 }) },
          { id: "models", label: t.models, icon: createElement(IconDataOutline16, { size: 16 }) },
          { type: "separator", id: "settings-separator" },
          { id: "settings", label: t.settings, icon: createElement(IconSettingsOutline16, { size: 16 }) },
        ]
      : [
          { type: "label", id: "provider", text: provider.name },
          ...(provider.id === provider.name
            ? []
            : [{ type: "label" as const, id: "provider-id", text: `${t.providerId}${provider.id}` }]),
          { type: "separator", id: "provider-separator" },
          { id: "models", label: t.models, icon: createElement(IconDataOutline16, { size: 16 }) },
          { id: "sign-in", label: t.signIn, icon: createElement(IconUserOutline16, { size: 16 }) },
          { id: "settings", label: t.settings, icon: createElement(IconSettingsOutline16, { size: 16 }) },
        ]
  const select = (id: string): void => {
    setOpen(false)
    if (id === "sign-in") void store.activate()
    else if (id === "sign-out") void store.deactivate()
    else if (id === "models") requestSettings("models")
    else if (id === "settings") requestSettings()
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
          createElement("span", { className: css.secondary }, secondary),
        ),
        wide && createElement(IconChevronUpOutline14, { className: css.chevron, size: 14 }),
      ),
    },
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
