/**
 * Navigation and side-effect policy the agent tools share.
 *
 * Humans type any http(s) URL they want. The model does not: a new
 * registrable domain, a high-risk host, or a side-effect action needs an
 * explicit `confirm: true` after the user has seen the request. That is
 * the whole trust model — page text is data, never permission.
 */
/** Per-conversation browse scope: the first domain is free, later ones are not. */
export declare class BrowseScope {
    private readonly domains;
    /** Remember a domain the user or a confirmed hop already opened. */
    allow(domain: string): void;
    /** Whether this conversation has already visited the registrable domain. */
    knows(domain: string): boolean;
    /** Whether any domain has been recorded. */
    get empty(): boolean;
}
/** Registrable domain of a hostname (eTLD+1, with a small multi-part TLD list). */
export declare function registrableDomain(hostname: string): string;
/** Whether a host is a payment, cloud-console, or identity surface. */
export declare function isHighRiskHost(hostname: string): boolean;
/**
 * Gate one agent navigation. The first domain in a conversation is free;
 * a new eTLD or a high-risk host requires `confirm: true`.
 */
export declare function assertAgentNavigation(scope: BrowseScope, url: string, confirm: boolean): void;
/** Gate a side-effect action (upload, submit, or a destructive-looking click). */
export declare function assertSideEffect(kind: string, confirm: boolean, name?: string): void;
/** Whether an accessible name looks like a submit / pay / delete control. */
export declare function isSideEffectName(name: string | undefined): boolean;
