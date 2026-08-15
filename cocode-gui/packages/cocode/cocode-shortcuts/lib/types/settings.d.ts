import z from "schemastery";
export declare const SHORTCUTS_SETTINGS_NAMESPACE = "cocode-shortcuts";
export declare const SHORTCUTS_SETTINGS_VERSION = 1;
export declare const ShortcutSettingsSchema: z<Schemastery.ObjectS<{
    version: z<number, number>;
    bindings: z<import("cosmokit").Dict<{
        combo?: ({
            key?: string | null | undefined;
            primary?: boolean | null | undefined;
            alt?: boolean | null | undefined;
            shift?: boolean | null | undefined;
            control?: boolean | null | undefined;
        } & import("@deepseek-ai/cosmokit").Dict) | null | undefined;
        scope?: "app" | "global" | null | undefined;
        disabled?: boolean | null | undefined;
    } & import("@deepseek-ai/cosmokit").Dict, string>, import("cosmokit").Dict<Schemastery.ObjectT<{
        combo: z<Schemastery.ObjectS<{
            key: z<string, string>;
            primary: z<boolean, boolean>;
            alt: z<boolean, boolean>;
            shift: z<boolean, boolean>;
            control: z<boolean, boolean>;
        }>, Schemastery.ObjectT<{
            key: z<string, string>;
            primary: z<boolean, boolean>;
            alt: z<boolean, boolean>;
            shift: z<boolean, boolean>;
            control: z<boolean, boolean>;
        }>>;
        scope: z<"app" | "global", "app" | "global">;
        disabled: z<boolean, boolean>;
    }>, string>>;
}>, Schemastery.ObjectT<{
    version: z<number, number>;
    bindings: z<import("cosmokit").Dict<{
        combo?: ({
            key?: string | null | undefined;
            primary?: boolean | null | undefined;
            alt?: boolean | null | undefined;
            shift?: boolean | null | undefined;
            control?: boolean | null | undefined;
        } & import("@deepseek-ai/cosmokit").Dict) | null | undefined;
        scope?: "app" | "global" | null | undefined;
        disabled?: boolean | null | undefined;
    } & import("@deepseek-ai/cosmokit").Dict, string>, import("cosmokit").Dict<Schemastery.ObjectT<{
        combo: z<Schemastery.ObjectS<{
            key: z<string, string>;
            primary: z<boolean, boolean>;
            alt: z<boolean, boolean>;
            shift: z<boolean, boolean>;
            control: z<boolean, boolean>;
        }>, Schemastery.ObjectT<{
            key: z<string, string>;
            primary: z<boolean, boolean>;
            alt: z<boolean, boolean>;
            shift: z<boolean, boolean>;
            control: z<boolean, boolean>;
        }>>;
        scope: z<"app" | "global", "app" | "global">;
        disabled: z<boolean, boolean>;
    }>, string>>;
}>>;
export type ShortcutSettings = {
    readonly version: 1;
    readonly bindings: Record<string, UserBinding>;
};
export type UserBinding = {
    readonly combo?: import("./client/combo.ts").Combo;
    readonly scope?: "app" | "global";
    readonly disabled?: boolean;
};
export type ShortcutSettingsView = {
    readonly value: ShortcutSettings;
    readonly user?: unknown;
    readonly base?: unknown;
    readonly revision: number;
    readonly writable: boolean;
};
export declare const DEFAULT_SHORTCUT_SETTINGS: ShortcutSettings;
