import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client"
import type {} from "@deepseek-ai/dsh-client-locale/client"
import type {} from "@deepseek-ai/dsh-client-ui-settings/client"
import type {} from "@deepseek-ai/dsh-client-ui-slots"
import { ShortcutsSection } from "./ShortcutsGeneralItem.tsx"
import { NEW_SESSION_COMMAND, SIDEBAR_TOGGLE_COMMAND, ShortcutRegistry } from "./registry.ts"
import type { ShortcutCommand } from "./registry.ts"
import { ShortcutSettingsController } from "./settings-controller.ts"
import { en, zh, type ShortcutsLocaleKey } from "./locales.ts"

export { ShortcutRegistry, NEW_SESSION_COMMAND, SIDEBAR_TOGGLE_COMMAND }
export type { ShortcutCommand } from "./registry.ts"
export type { Combo } from "./combo.ts"
export { ShortcutSettingsController } from "./settings-controller.ts"

export const inject = ["slots", "layout", "workspaces", "locale"]

declare module "@deepseek-ai/dsh-client-ui-slots" {
  interface LocaleNamespaceMap {
    "settings.shortcuts": ShortcutsLocaleKey
  }
}

const SHORTCUTS_LOCALE_NAMESPACE = "settings.shortcuts"

declare module "@deepseek-ai/cordis" {
  interface Context {
    shortcuts: ShortcutRegistry
  }
}

function commandCatalog(ctx: ClientContext): readonly ShortcutCommand[] {
  return [
    {
      id: SIDEBAR_TOGGLE_COMMAND,
      title: "切换侧栏",
      description: "显示或隐藏左侧工作区栏",
      defaultCombo: { key: "b", primary: true },
      run: () => { ctx.layout.toggleSidebar() },
    },
    {
      id: NEW_SESSION_COMMAND,
      title: "新建会话",
      description: "在当前或最近的工作区创建新会话",
      defaultCombo: { key: "n", primary: true },
      globalCapable: true,
      run: () => { ctx.workspaces.startSession() },
    },
  ]
}

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(SHORTCUTS_LOCALE_NAMESPACE, { zh, en }), "cocode-shortcuts: dictionaries")
  const t = ctx.locale.bind(SHORTCUTS_LOCALE_NAMESPACE)
  const settings = new ShortcutSettingsController()
  const registry = new ShortcutRegistry(ctx, settings)
  ctx.reflect.provide("shortcuts", registry)
  ctx.effect(() => {
    settings.mount()
    return () => { settings.dispose() }
  }, "cocode-shortcuts: settings controller")
  ctx.effect(() => registry.mount(), "cocode-shortcuts: keyboard dispatcher")

  for (const command of commandCatalog(ctx)) {
    ctx.effect(() => registry.register(command), `cocode-shortcuts: ${command.id}`)
  }

  ctx.slots.inject("settings.section", () => ctx.slots.register({
    name: "settings.section",
    id: "cocode-shortcuts",
    order: 12,
    label: () => t("nav"),
    locale: SHORTCUTS_LOCALE_NAMESPACE,
    inject: (): { registry: ShortcutRegistry } => ({ registry }),
  }, ShortcutsSection))
}
