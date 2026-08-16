import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
import type { UserBinding } from "../settings.ts";
import { type Combo } from "./combo.ts";
import type { ShortcutSettingsController } from "./settings-controller.ts";
export declare const SIDEBAR_TOGGLE_COMMAND = "cocode.sidebar.toggle";
export declare const NEW_SESSION_COMMAND = "cocode.newSession";
type LayoutFace = {
    readonly toggleSidebar: () => void;
};
declare module "@deepseek-ai/cordis" {
    interface Context {
        layout: LayoutFace;
    }
}
export type ShortcutScope = "app" | "global";
export type ShortcutCommand = {
    readonly id: string;
    readonly title: string;
    readonly description?: string;
    readonly defaultCombo?: Combo;
    readonly defaultScope?: ShortcutScope;
    readonly globalCapable?: boolean;
    readonly allowInTextEntry?: boolean;
    readonly when?: () => boolean;
    readonly run: (event?: KeyboardEvent) => void | boolean;
};
export type EffectiveBinding = {
    readonly commandId: string;
    readonly combo: Combo;
    readonly scope: ShortcutScope;
    readonly title: string;
    readonly globalCapable: boolean;
};
export type ShortcutConflict = {
    readonly combo: Combo;
    readonly commandIds: readonly string[];
};
export type ShortcutSnapshot = {
    readonly commands: readonly ShortcutCommand[];
    readonly bindings: readonly EffectiveBinding[];
    readonly conflicts: readonly ShortcutConflict[];
    readonly orphaned: readonly string[];
    readonly settingsStatus: "loading" | "ready" | "memory";
    readonly writable: boolean;
    readonly settingsError?: string;
    readonly globalError?: string;
};
type DesktopShortcutsApi = {
    sync(request: {
        readonly bindings: readonly {
            readonly commandId: string;
            readonly accelerator: string;
        }[];
    }): Promise<{
        readonly ok: boolean;
        readonly conflicts?: readonly {
            readonly accelerator: string;
            readonly reason: string;
        }[];
    }>;
    onTriggered(listener: (commandId: string) => void): () => void;
};
declare global {
    interface Window {
        readonly desktopApi?: {
            readonly shortcuts?: DesktopShortcutsApi;
        };
    }
}
/** Client-side command and keymap registry shared by Cocode feature plugins. */
export declare class ShortcutRegistry {
    private readonly ctx;
    private readonly settings;
    private readonly commandsById;
    private readonly order;
    private readonly listeners;
    private userBindings;
    private recording;
    private snapshot;
    private globalSyncGeneration;
    private globalError;
    constructor(ctx: ClientContext, settings: ShortcutSettingsController);
    getSnapshot: () => ShortcutSnapshot;
    subscribe: (listener: () => void) => (() => void);
    mount(): () => void;
    register(command: ShortcutCommand): () => void;
    setRecording(active: boolean): void;
    getUserBinding(commandId: string): UserBinding | undefined;
    setBinding(commandId: string, binding: UserBinding): void;
    resetBinding(commandId: string): void;
    reloadSettings(): void;
    execute(commandId: string, event?: KeyboardEvent): boolean;
    handle(event: KeyboardEvent): boolean;
    private buildSnapshot;
    private publish;
    private syncGlobalShortcuts;
}
export declare function comboFromEvent(event: KeyboardEvent): Combo | undefined;
export {};
