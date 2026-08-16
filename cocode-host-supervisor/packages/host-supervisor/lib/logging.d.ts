export interface HostLoggerOptions {
    readonly stateDirectory: string;
    readonly runtimeVersion?: string;
}
export declare class HostLogger {
    readonly logDirectory: string;
    private readonly sink;
    private readonly logger;
    private readonly appRunId;
    constructor(options: HostLoggerOptions);
    log(level: 'debug' | 'info' | 'warn' | 'error' | 'fatal', eventName: string, attributes?: Record<string, string | number | boolean | null>): void;
    hostLine(stream: 'stdout' | 'stderr', line: string): void;
    flush(): void;
    close(): void;
}
