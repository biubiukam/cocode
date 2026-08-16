/**
 * The page observation the model reads: an accessibility projection, not
 * pixels and not HTML.
 *
 * Raw DOM is unusable as an agent surface — a modern page is megabytes of
 * generated class names, and the model would spend its whole budget parsing
 * markup it cannot act on. The accessibility tree is the same information the
 * page already publishes to screen readers: semantic role, name, and state,
 * with the noise gone.
 *
 * Three CDP calls build the whole snapshot regardless of page size: the AX
 * tree for semantics, one DOM snapshot for the geometry AND attributes of
 * every node, and layout metrics for the viewport. Per-node roundtrips are
 * reserved for acting, where only one node is involved.
 */
import type { BrowserSnapshot } from './protocol.ts';
import { attributeOf, type CdpSession } from './cdp.ts';
/** Options bounding one snapshot. */
export interface SnapshotOptions {
    /** Maximum nodes returned; the rest are summarized in `truncation`. */
    maxNodes: number;
}
/** A built snapshot plus the ref table the action dispatcher resolves against. */
export interface SnapshotResult {
    snapshot: Omit<BrowserSnapshot, 'tabId' | 'generation' | 'screenshot' | 'pendingDialog'>;
    /** ref → backendDOMNodeId for exactly the nodes this snapshot returned. */
    refs: Map<string, number>;
}
/**
 * Build one page observation.
 *
 * @param cdp - Session attached to the page being observed.
 * @param options - Node budget.
 */
export declare function buildSnapshot(cdp: CdpSession, options: SnapshotOptions): Promise<SnapshotResult>;
/** Re-exported for the action dispatcher's file-input detection. */
export { attributeOf };
