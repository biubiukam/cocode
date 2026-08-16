import type { Page } from 'playwright-core';
import { type BrowserAction, type BrowserDialog } from './protocol.ts';
import { type CdpSession } from './cdp.ts';
/** Everything one action needs from the tab that owns the page. */
export interface ActionContext {
    cdp: CdpSession;
    page: Page;
    /** Resolve a snapshot ref to its backend node id, or throw a stale error. */
    resolveRef(ref: string): number;
    /** The dialog currently blocking the page, if any. */
    pendingDialog(): BrowserDialog | null;
    /** Answer the pending dialog. */
    answerDialog(accept: boolean, text?: string): Promise<void>;
    /** Timeout applied to a single action, in milliseconds. */
    timeoutMs: number;
    /** Aborted when a human takes the page over mid-action. */
    signal?: AbortSignal;
}
/**
 * Run one action against the page.
 *
 * @returns A one-line description of what happened, for the tool's render.
 */
export declare function dispatchAction(context: ActionContext, action: BrowserAction): Promise<string>;
