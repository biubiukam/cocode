import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
type AccountSnapshot = {
    phase: "signed-out" | "signing-in" | "provisioning" | "signed-in" | "error";
    profile: {
        displayName: string;
        email?: string;
    } | null;
    cloud: {
        status: "absent" | "ready" | "conflict" | "error";
        providerId: "cocode-cloud";
    };
    error?: {
        code: string;
        message: string;
    };
};
type DesktopAccountApi = {
    snapshot(): Promise<AccountSnapshot>;
    signIn(): Promise<AccountSnapshot>;
    signOut(): Promise<void>;
    onChanged(listener: (snapshot: AccountSnapshot) => void): () => void;
};
declare global {
    interface Window {
        readonly desktopApi?: {
            readonly account?: DesktopAccountApi;
        };
    }
}
export declare const inject: string[];
export declare function apply(ctx: ClientContext): void;
export declare function mountStandalone(target: HTMLElement): () => void;
export {};
