import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
type DiagnosticsStatus = {
    readonly appLogBytes: number;
    readonly hostLogBytes: number;
    readonly crashCount: number;
    readonly temporaryDebugUntil?: string;
    readonly droppedRecordCount: number;
};
type DiagnosticsApi = {
    readonly getStatus: () => Promise<DiagnosticsStatus>;
    readonly openLogFolder: () => Promise<void>;
    readonly exportBundle: () => Promise<{
        readonly cancelled: boolean;
        readonly fileName?: string;
        readonly bytes?: number;
    }>;
    readonly clearLogs: () => Promise<void>;
    readonly enableTemporaryDebug: (request: {
        readonly durationMinutes: 30 | 60;
    }) => Promise<{
        readonly enabledUntil: string;
    }>;
};
declare global {
    interface Window {
        readonly desktopApi?: {
            readonly diagnostics?: DiagnosticsApi;
        };
    }
}
export type DiagnosticsSectionProps = PropsRuntime<'settings.section'>;
export declare function DiagnosticsSection(): JSX.Element;
export {};
