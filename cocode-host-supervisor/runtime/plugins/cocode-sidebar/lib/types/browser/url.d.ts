/**
 * Address-bar URL policy for the sidebar browser, shared by both halves: the
 * toolbar normalizes what the user typed, and the host re-validates every
 * navigation (including each redirect hop) before it reaches the page.
 *
 * Unlike the retired iframe previewer, loopback is ALLOWED here: previewing a
 * dev server the user just started is the single most common reason to open
 * this panel, and a real browser profile makes it no more dangerous than
 * opening the same URL in Chrome. What stays refused is any non-http(s)
 * scheme and the GUI's own origin — a page served by the DSH server has no
 * business being driven from inside the automation profile.
 *
 * Kept dependency-free and Node-free so both bundles can import it.
 */
/** Why one navigation attempt was refused. */
export type BrowserBlockReason = 'scheme' | 'self';
/** Result of normalizing one address-bar input. */
export type BrowserNavigateResult = {
    kind: 'ok';
    url: string;
} | {
    kind: 'blocked';
    reason: BrowserBlockReason;
} | {
    kind: 'invalid';
};
/**
 * Normalize one address-bar input against the navigation policy.
 *
 * @param input - Raw user text or a URL reported by the page.
 * @param selfOrigin - The GUI server's own origin, refused so the automation
 * profile never drives the Cocode UI itself. Pass `undefined` when unknown
 * (the host derives it from the request Host header).
 */
export declare function normalizeBrowserUrl(input: string, selfOrigin?: string): BrowserNavigateResult;
