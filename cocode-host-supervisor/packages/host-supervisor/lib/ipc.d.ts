import net from 'node:net';
export type RpcRequest = {
    id: number;
    method: string;
    params?: Record<string, unknown>;
};
export type RpcResponse = {
    id: number;
    result?: unknown;
    error?: {
        code: number;
        message: string;
    };
};
export declare function openLineConnection(endpoint: string): Promise<LinePeer>;
export declare class LinePeer {
    private readonly input;
    private readonly output;
    private buffer;
    private nextId;
    private readonly pending;
    private readonly notifications;
    private readonly closeHandlers;
    private closed;
    private closeNotified;
    constructor(input: NodeJS.ReadableStream, output: NodeJS.WritableStream);
    request<T>(method: string, params?: Record<string, unknown>, timeoutMs?: number): Promise<T>;
    onNotification(handler: (method: string, params: Record<string, unknown>) => void): () => void;
    onClose(handler: (error: Error) => void): () => void;
    close(): void;
    private onData;
    private fail;
}
export declare function listenLineServer(server: net.Server, endpoint: string): Promise<void>;
