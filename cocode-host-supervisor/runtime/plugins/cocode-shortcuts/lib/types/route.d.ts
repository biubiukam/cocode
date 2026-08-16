import type { ShortcutSettings, ShortcutSettingsView } from "./settings.ts";
import type { Context } from "./context-types.ts";
export declare const SHORTCUTS_API_PREFIX = "/cocode/shortcuts/api";
export type { ShortcutSettingsView } from "./settings.ts";
export interface ShortcutSettingsFace {
    get(): ShortcutSettingsView;
    update(patch: Partial<ShortcutSettings>, expectedRevision?: number): Promise<ShortcutSettingsView>;
}
export declare function registerShortcutsRoute(ctx: Context, getSettings: () => ShortcutSettingsFace | undefined): () => void;
