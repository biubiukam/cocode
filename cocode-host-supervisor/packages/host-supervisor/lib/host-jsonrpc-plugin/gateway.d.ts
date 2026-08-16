import { CompanionTransport } from './transport.js';
import type { CompanionCapabilities, InitializeParams, PromptParams, RuntimeContext } from './types.js';
/** Cocode-owned stdio gateway. It consumes Harness services without importing Harness runtime packages. */
export declare class TuiCompanionGateway {
    private readonly ctx;
    private readonly transport;
    private cwd;
    private provider;
    private model;
    private maxTokens;
    private initialized;
    private shuttingDown;
    private shutdownTask;
    private readonly sessions;
    private readonly sessionCreations;
    private readonly sessionOpenings;
    private readonly pendingPermissionModes;
    private readonly pendingPlanModes;
    private readonly turnAllowances;
    private readonly pendingQuestions;
    private readonly pendingApprovals;
    private readonly disposers;
    private questionDisposer;
    private approvalDisposer;
    constructor(ctx: RuntimeContext, transport: CompanionTransport, options?: {
        registerQuestionProvider?: boolean;
    });
    /** Register optional question provider when the service is already mounted. */
    tryRegisterQuestionProvider(): void;
    /** Remove the question provider owned by this gateway. */
    unregisterQuestionProvider(): void;
    private registerApprovalProvider;
    /** Advertise only services that are actually present in this composition. */
    capabilities(): CompanionCapabilities;
    initialize(params: InitializeParams): Promise<{
        serverInfo: {
            name: string;
            version: string;
        };
        capabilities: CompanionCapabilities;
    }>;
    prompt(params: PromptParams): Promise<{
        messageId: string;
    }>;
    listSessions(params?: {
        cwd?: string;
    }): Promise<{
        sessions: Record<string, unknown>[];
    }>;
    permissionMode(params: {
        sessionId: string;
        mode?: string;
    }): Promise<{
        mode: string;
        supportedModes: string[];
    }>;
    planMode(params: {
        sessionId: string;
        active?: boolean;
    }): Promise<{
        active: boolean;
        pending?: boolean;
    }>;
    cancel(params: {
        sessionId: string;
        keepInbox?: boolean;
    }): {
        cancelled: boolean;
    };
    open(params: {
        sessionId: string;
        replaceSessionId?: string;
    }): Promise<Record<string, unknown>>;
    fork(params: {
        sourceSessionId: string;
        boundary?: number;
        rewindToMessageSeq?: number;
        childSessionId?: string;
        replaceSessionId?: string;
    }): Promise<Record<string, unknown>>;
    listSkills(params: {
        sessionId: string;
    }): Promise<{
        skills: Record<string, unknown>[];
    }>;
    respondQuestion(params: Record<string, unknown>): Promise<Record<string, never>>;
    respondApproval(params: Record<string, unknown>): Promise<Record<string, never>>;
    handleRequest(method: string, params?: Record<string, unknown>): Promise<unknown>;
    shutdown(): Promise<Record<string, never>>;
    /** Detach this socket without disposing agents owned by the shared Host. */
    disconnect(): Promise<Record<string, never>>;
    private askQuestion;
    private askApproval;
    private getOrCreateSession;
    private createSession;
    private resumeSession;
    private borrowSession;
    private replaceSession;
    private requireSession;
    private assertLive;
    private assertInitialized;
    private hasTurnAllowance;
    private rememberTurnAllowance;
    private performShutdown;
}
