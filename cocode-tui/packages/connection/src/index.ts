/**
 * Harness JSON-RPC transport for Cocode TUI.
 * Sole package allowed to import @deepseek-ai/dsh-sdk-client.
 * The published SDK keeps clean Windows/Linux checkouts installable without a
 * sibling cocode-harness clone.
 */

export { createTuiRuntime } from './client.ts'
export { parseInitFromEnv, parseLaunchFromEnv } from './env.ts'
export type { EnvError } from './env.ts'
export type {
  ContentBlock,
  SessionEvent,
  SubagentFinished,
  TuiInitialize,
  TuiLaunch,
  TuiNotification,
  TuiRuntime,
} from './types.ts'

/** @deprecated Use TuiLaunch. Kept for the scaffold call site. */
export type { TuiLaunch as HarnessJsonRpcLaunch } from './types.ts'
