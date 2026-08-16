export type Combo = {
    readonly key: string;
    readonly primary?: boolean;
    readonly alt?: boolean;
    readonly shift?: boolean;
    readonly control?: boolean;
};
/** Normalize a browser key into the platform-neutral shortcut vocabulary. */
export declare function normalizeKey(key: string): string | undefined;
/** Convert a keyboard event into a persistable Combo, or reject modifiers alone. */
export declare function comboFromKeyboardEvent(event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">, platform?: string): Combo | undefined;
/** Stable equality key used for conflict detection and browser matching. */
export declare function comboId(combo: Combo, platform?: string): string;
/** Match one normalized Combo against a browser keyboard event. */
export declare function matchesCombo(combo: Combo, event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">, platform?: string): boolean;
/** Format a Combo for the current platform and the settings UI. */
export declare function formatCombo(combo: Combo | undefined, platform?: string): string;
/** Convert a Combo to Electron's platform-neutral accelerator syntax. */
export declare function toElectronAccelerator(combo: Combo): string;
/** Reject dangerous or ambiguous bindings before they reach the settings file. */
export declare function isUsableCombo(combo: Combo): boolean;
export declare function isTextEntryTarget(target: EventTarget | null): boolean;
