/**
 * Auth module surface for main and commands. Present imports types only.
 */

export { createAuthStore, type AuthStore } from './store.ts'
export { homeDisplay, productHome, defaultHomeContext } from './paths.ts'
export type { AuthAction, AuthSnapshot, ResolvedAuth } from './types.ts'
