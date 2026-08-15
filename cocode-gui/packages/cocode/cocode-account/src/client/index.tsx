import { createElement, useEffect, useRef, useSyncExternalStore } from "react"
import type { ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client"

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

type AccountProps = { readonly wide: boolean; readonly store: AccountStore }

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
  },
} as const

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

function AccountAction({ wide, store }: AccountProps): ReturnType<typeof createElement> {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const signedIn = snapshot.phase === "signed-in" || snapshot.phase === "provisioning"
  const canSignOut = signedIn || snapshot.error?.code === "cleanup-pending"
  const t = copy()
  const title = accountError(snapshot) ?? (canSignOut ? t.signOutTitle : t.signInTitle)
  return createElement(
    "button",
    {
      type: "button",
      title,
      onClick: () => { void (canSignOut ? store.deactivate() : snapshot.phase === "error" ? store.retry() : store.activate()) },
      disabled: snapshot.phase === "signing-in" || snapshot.phase === "provisioning",
      style: {
        width: wide ? "100%" : "40px",
        minHeight: "32px",
        padding: wide ? "0 10px" : "0",
        border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.25))",
        borderRadius: "8px",
        background: "transparent",
        color: "var(--dsw-alias-label-secondary, currentColor)",
        cursor: "pointer",
        font: "inherit",
        fontSize: "12px",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      },
    },
    labelOf(snapshot, wide),
  )
}

export const inject = ["slots"]

export function apply(ctx: ClientContext): void {
  const store = new AccountStore()
  ctx.effect(() => () => store.dispose(), "cocode-account: dispose store")
  const slots = ctx.slots as unknown as {
    inject(name: string, factory: () => unknown): unknown
    register(options: unknown, component: unknown): unknown
  }
  slots.inject("sidebar.footer.action", () => slots.register({
    name: "sidebar.footer.action",
    id: "cocode-account",
    order: -100,
    inject: () => ({ store }),
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
  let root: Root | undefined
  root = createRoot(target)
  root.render(createElement(AccountAction, { wide: true, store }))
  return () => root?.unmount()
}
