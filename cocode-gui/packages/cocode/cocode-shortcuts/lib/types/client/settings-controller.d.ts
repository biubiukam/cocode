import { type ShortcutSettings, type UserBinding } from "../settings.ts";
import { type ShortcutSettingsTransport } from "./settings-api.ts";
export type ShortcutSettingsControllerStatus = "loading" | "ready" | "memory";
export type ShortcutSettingsControllerSnapshot = {
    readonly value: ShortcutSettings;
    readonly status: ShortcutSettingsControllerStatus;
    readonly writable: boolean;
    readonly revision?: number;
    readonly error?: string;
};
type FocusTarget = {
    addEventListener(type: "focus", listener: () => void): void;
    removeEventListener(type: "focus", listener: () => void): void;
};
/** Owns shortcut settings loading, revision-fenced writes, and memory fallback. */
export declare class ShortcutSettingsController {
    private readonly transport;
    private readonly listeners;
    private snapshot;
    private focusTarget;
    private generation;
    private disposed;
    private hasRemoteState;
    constructor(transport?: ShortcutSettingsTransport);
    getSnapshot: () => ShortcutSettingsControllerSnapshot;
    subscribe: (listener: () => void) => (() => void);
    mount(target?: FocusTarget): void;
    reload(): Promise<void>;
    setBindings(bindings: Record<string, UserBinding>): Promise<void>;
    resetBinding(commandId: string): Promise<void>;
    dispose(): void;
    private readonly onFocus;
    private publish;
}
export {};
