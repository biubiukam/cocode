//#region src/index.ts
const COCODE_ACCOUNT_PLUGIN = "cocode-account";
/** Host-side identity used by the DSH Loader when the package is included in boot. */
const name = COCODE_ACCOUNT_PLUGIN;
/** The account UI is client-only; the host entry has no service dependencies. */
const inject = [];
/**
* Keep a valid Cordis host-plugin entry for the package. Account operations
* stay in Electron Main and the browser client bundle; this hook only makes
* the package loadable by the DSH host plugin tree.
*/
function apply() {}
//#endregion
export { COCODE_ACCOUNT_PLUGIN, apply, inject, name };
