import type { Context } from '../context-types.ts';
import type { BrowserRegistry } from './registry.ts';
/**
 * Register the browser tools.
 *
 * @param ctx - Host plugin context (carries the tool registry).
 * @param registry - The session tab book both halves share.
 * @param resolveCwd - Live session cwd, the containment root for uploads.
 * @returns A disposer that unregisters every tool.
 */
export declare function registerBrowserTools(ctx: Context, registry: BrowserRegistry, resolveCwd: (sessionId: string) => string): () => void;
