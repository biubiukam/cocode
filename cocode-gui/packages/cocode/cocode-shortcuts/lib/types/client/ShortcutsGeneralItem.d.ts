import type { InjectFace, PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
import { type ShortcutRegistry } from "./registry.ts";
import { type Combo } from "./combo.ts";
export type ShortcutsSectionInjected = {
    readonly registry: ShortcutRegistry;
};
export type ShortcutsSectionProps = PropsRuntime<"settings.section"> & InjectFace<ShortcutsSectionInjected>;
export declare function ShortcutsSection({ registry }: ShortcutsSectionProps): import("react").JSX.Element;
export type { Combo };
