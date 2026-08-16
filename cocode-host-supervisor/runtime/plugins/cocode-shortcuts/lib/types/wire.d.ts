import type { ShortcutsHttpRequest, ShortcutsHttpResponse } from "./context-types.ts";
export type ShortcutsRouteErrorCode = "bad-request" | "forbidden" | "method-not-allowed" | "not-found" | "settings-conflict" | "settings-rejected" | "internal";
export declare class ShortcutsRouteError extends Error {
    readonly code: ShortcutsRouteErrorCode;
    readonly status: number;
    constructor(code: ShortcutsRouteErrorCode, message: string, status?: number);
}
export declare function readJsonBody(request: ShortcutsHttpRequest): Promise<unknown>;
export declare function writeJson(response: ShortcutsHttpResponse, status: number, body: unknown): void;
export declare function writeOk(response: ShortcutsHttpResponse, value: unknown): void;
export declare function writeError(response: ShortcutsHttpResponse, error: unknown): void;
