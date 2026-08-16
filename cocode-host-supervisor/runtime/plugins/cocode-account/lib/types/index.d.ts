export declare const COCODE_ACCOUNT_PLUGIN = "cocode-account";
/** Host-side identity used by the DSH Loader when the package is included in boot. */
export declare const name = "cocode-account";
/** The account UI is client-only; the host entry has no service dependencies. */
export declare const inject: readonly string[];
/**
 * Keep a valid Cordis host-plugin entry for the package. Account operations
 * stay in Electron Main and the browser client bundle; this hook only makes
 * the package loadable by the DSH host plugin tree.
 */
export declare function apply(): void;
