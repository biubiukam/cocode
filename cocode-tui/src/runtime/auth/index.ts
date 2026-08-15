/**
 * Auth module surface for main and commands. Present imports types only.
 */

export { createAuthStore, type AuthStore, type SelectModeResult } from './store.ts'
export {
  accountHome,
  dshHome,
  homeDisplay,
  productHome,
  productHomes,
  defaultHomeContext,
} from './paths.ts'
export { saveByokKey } from './resolve.ts'
export {
  HomeBusyError,
  otherLiveCount,
  registerLiveInstance,
  releaseLiveInstance,
  releaseLiveInstanceSync,
} from './live-instances.ts'
export type { AuthAction, AuthSnapshot, ResolvedAuth } from './types.ts'
