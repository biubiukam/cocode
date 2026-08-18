import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client"
// Type-only: pulls in the locale plugin's Context merge (ctx.locale).
import type {} from "@deepseek-ai/dsh-client-locale/client"
import { DockSurface } from "./DockSurface.tsx"
import { Launcher } from "./Launcher.tsx"
import { WorkbenchController, type WorkbenchLayoutFace } from "./controller.ts"
import { builtInPanels } from "./builtins.tsx"
import { LOCALE_NS, attachLocale, en, zh, type WorkbenchKey } from "./locales.ts"
import { CommitModelRow } from "./settings-row.tsx"
import { CommandLineSection } from "./command-line-section.tsx"
import { DiagnosticsSection } from "./diagnostics-section.tsx"
import type { WorkbenchPanelProps } from "./model.ts"
import { registerFileMention } from "./file-mention.ts"

export type * from "./model.ts"
export { WorkbenchController } from "./controller.ts"

declare module "@deepseek-ai/cordis" {
  interface Context {
    workbench: import("./model.ts").WorkbenchService
  }
}

declare module "@deepseek-ai/dsh-client-ui-slots" {
  interface LocaleNamespaceMap {
    /** Workbench docks, panels and the source control surface. */
    cocodeWorkbench: WorkbenchKey
  }
}

export const inject = ["slots", "layout", "sessions", "locale"]

export function apply(ctx: ClientContext): void {
  const layout = ctx.get("layout") as WorkbenchLayoutFace
  const sessions = ctx.get("sessions") as WorkbenchPanelProps["sessions"]
  // Panels render outside the slot injection path, so they read the dictionary
  // through the module-level translate instead of an injected `t` seat.
  attachLocale(ctx.locale)
  ctx.effect(() => ctx.locale.register(LOCALE_NS, { zh, en }), "cocode-workbench: dictionaries")
  ctx.inject(["inputTriggers"], (scope: ClientContext) => { registerFileMention(scope) })
  const controller = new WorkbenchController(layout, window.localStorage)
  const disposeService = ctx.reflect.provide("workbench", controller)
  for (const descriptor of builtInPanels()) {
    ctx.effect(() => controller.registerPanel(descriptor), `cocode-workbench: ${descriptor.id}`)
  }
  const slots = ctx.slots as unknown as {
    inject(name: string, factory: () => unknown): unknown
    register(options: unknown, component: unknown): () => void
  }
  slots.inject("workbench.right", () => slots.register({
    name: "workbench.right",
    inject: (sessionId?: string) => ({ controller, sessionId, sessions }),
  }, DockSurface))
  slots.inject("workbench.bottom", () => slots.register({
    name: "workbench.bottom",
    inject: (sessionId?: string) => ({ controller, sessionId, sessions }),
  }, DockSurface))
  slots.inject("shell.overlay", () => slots.register({
    name: "shell.overlay",
    id: "cocode-workbench-launcher",
    order: 10,
    inject: () => ({ controller }),
  }, Launcher))
  // 提交消息模型是一项全局偏好，排在通用设置的既有条目之后。
  slots.inject("settings.general.item", () => slots.register({
    name: "settings.general.item",
    id: "cocode-workbench-commit-model",
    order: 40,
    inject: () => ({}),
  }, CommitModelRow))
  slots.inject("settings.section", () => slots.register({
    name: "settings.section",
    id: "cocode-workbench-command-line",
    order: 850,
    label: () => isChinese() ? "命令行" : "Command line",
  }, CommandLineSection))
  slots.inject("settings.section", () => slots.register({
    name: "settings.section",
    id: "cocode-workbench-diagnostics",
    order: 900,
    label: () => isChinese() ? "诊断" : "Diagnostics",
  }, DiagnosticsSection))
  ctx.effect(() => () => { void disposeService() }, "cocode-workbench: dispose service")
}

function isChinese(): boolean {
  return document.documentElement.lang.toLowerCase().startsWith("zh") || navigator.language.toLowerCase().startsWith("zh")
}
