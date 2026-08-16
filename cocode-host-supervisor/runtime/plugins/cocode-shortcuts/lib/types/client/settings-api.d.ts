import type { ShortcutSettings, ShortcutSettingsView } from "../settings.ts";
export declare class ShortcutSettingsApiError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
export interface ShortcutSettingsTransport {
    get(): Promise<ShortcutSettingsView>;
    update(patch: Partial<ShortcutSettings>, expectedRevision?: number): Promise<ShortcutSettingsView>;
}
export declare const shortcutSettingsTransport: ShortcutSettingsTransport;
