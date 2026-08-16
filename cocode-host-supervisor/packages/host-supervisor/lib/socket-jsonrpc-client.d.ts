import type { HostServiceEndpoint } from './protocol.js';
export type JsonRpcNotification = {
    method: string;
    params: Record<string, unknown>;
};
export type JsonRpcPeer = {
    request<T>(method: string, params?: Record<string, unknown>, timeoutMs?: number): Promise<T>;
    subscribe(handler: (notification: JsonRpcNotification) => void): () => void;
    onClose(handler: (error?: string) => void): () => void;
    close(): void;
};
export declare function connectJsonRpc(endpoint: HostServiceEndpoint, token?: string): Promise<JsonRpcPeer>;
