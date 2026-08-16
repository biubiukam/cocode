import type { Readable, Writable } from 'node:stream';
type RequestHandler = (method: string, params: Record<string, unknown>) => Promise<unknown>;
/** Minimal NDJSON JSON-RPC peer owned by the TUI companion process. */
export declare class CompanionTransport {
    private readonly input;
    private readonly output;
    private buffer;
    private readonly decoder;
    private handler;
    private started;
    private closed;
    constructor(input: Readable, output: Writable);
    onRequest(handler: RequestHandler): void;
    start(): void;
    close(): void;
    notify(method: string, params?: Record<string, unknown>): void;
    flush(): Promise<void>;
    private readonly onData;
    private readonly onEnd;
    private readonly onError;
    private handleLine;
    private writeError;
    private write;
}
export {};
