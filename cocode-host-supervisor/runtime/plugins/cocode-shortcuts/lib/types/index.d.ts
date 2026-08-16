import type { Context } from "./context-types.ts";
import { SHORTCUTS_SETTINGS_NAMESPACE, ShortcutSettingsSchema } from "./settings.ts";
export { SHORTCUTS_SETTINGS_NAMESPACE, ShortcutSettingsSchema };
export type { ShortcutSettings, ShortcutSettingsView, UserBinding } from "./settings.ts";
export { SHORTCUTS_API_PREFIX } from "./route.ts";
export declare const name = "cocode-shortcuts";
export declare const inject: string[];
/** Register the settings namespace and its plugin-owned trusted Web route. */
export declare function apply(ctx: Context): void;
