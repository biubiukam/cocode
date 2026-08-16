import type { BrowserContext } from 'playwright-core';
import type { BrowserEngineStatus } from './protocol.ts';
/** Resolve the Harness home with the same precedence the runtime uses. */
export declare function dshHome(): string;
/** Where downloaded browser builds are cached (shared across carriers). */
export declare function enginesDir(): string;
/** Where one named browser profile persists its cookies and storage. */
export declare function profileDir(profile: string): string;
/** Where a profile's downloads land (never the workspace). */
export declare function downloadsDir(profile: string): string;
/** Tunables of the browser engine. */
export interface BrowserEngineOptions {
    /** Profile name; one persistent Chromium context per profile. */
    profile: string;
    /**
     * Run Chromium with a visible window. Off by default (the screencast is the
     * only surface); the escape hatch for sites that refuse headless traffic.
     */
    headed: boolean;
}
/**
 * The Chromium lifecycle owner: install state, a single persistent context,
 * and status fan-out to every connected viewport.
 */
export declare class BrowserEngine {
    private readonly options;
    private state;
    private readonly contexts;
    private installPromise;
    private readonly watchers;
    private userAgentOverride;
    private headed;
    constructor(options: BrowserEngineOptions);
    /** Switch headed mode. Takes effect on the next context launch. */
    setHeaded(headed: boolean): void;
    /** Current engine readiness (cheap; safe to call per request). */
    get status(): BrowserEngineStatus;
    /**
     * The UA every page should claim, or undefined to keep Chromium's own.
     * Known only after the context launches, which is why each tab applies it
     * itself instead of it being a launch option.
     */
    get userAgent(): string | undefined;
    /** Subscribe to readiness transitions; returns the disposer. */
    watch(listener: (status: BrowserEngineStatus) => void): () => void;
    private setStatus;
    /**
     * Refresh {@link status} from disk without downloading anything. Called
     * before the UI decides whether to show the install prompt.
     */
    probe(): Promise<BrowserEngineStatus>;
    private detect;
    /**
     * Download the Chromium build if it is missing. Concurrent callers share
     * one download. Resolves once the engine is ready; rejects with the install
     * failure so the caller can surface it verbatim.
     */
    install(): Promise<void>;
    private runInstall;
    /**
     * The shared persistent context, launched on first use. Cookies and login
     * state survive restarts, which is exactly what makes the agent useful —
     * and exactly why §credential-inheritance in the RFC is a deliberate
     * product decision rather than an accident.
     */
    context(profile?: string): Promise<BrowserContext>;
    /** Grant one permission for an origin on a named profile. */
    grantPermission(profile: string, origin: string, permission: string): Promise<void>;
    private launch;
    /** Close Chromium and forget every context (idempotent). */
    dispose(): Promise<void>;
}
