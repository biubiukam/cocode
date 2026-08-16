import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
import { NEW_SESSION_COMMAND, SIDEBAR_TOGGLE_COMMAND, ShortcutRegistry } from "./registry.ts";
import { type ShortcutsLocaleKey } from "./locales.ts";
export { ShortcutRegistry, NEW_SESSION_COMMAND, SIDEBAR_TOGGLE_COMMAND };
export type { ShortcutCommand } from "./registry.ts";
export type { Combo } from "./combo.ts";
export { ShortcutSettingsController } from "./settings-controller.ts";
export declare const inject: string[];
declare module "@deepseek-ai/dsh-client-ui-slots" {
    interface LocaleNamespaceMap {
        "settings.shortcuts": ShortcutsLocaleKey;
    }
}
declare module "@deepseek-ai/cordis" {
    interface Context {
        shortcuts: ShortcutRegistry;
    }
}
export declare function apply(ctx: ClientContext): void;
