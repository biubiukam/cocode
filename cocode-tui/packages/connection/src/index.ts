/** Shared Host JSON-RPC transport for Cocode TUI. */

export { createTuiRuntime } from './client.ts'
export { parseInitFromEnv, parseLaunchFromEnv } from './env.ts'
export type { EnvError } from './env.ts'
export type {
  ContentBlock,
  SessionEvent,
  SkillEntry,
  TuiQuestionAnswer,
  TuiQuestionAnswerItem,
  TuiQuestionItem,
  TuiQuestionIntent,
  TuiQuestionOption,
  TuiQuestionRequest,
  TuiApprovalAnswer,
  TuiApprovalOutcome,
  TuiApprovalRequest,
  TuiPromptMode,
  TuiRuntimeAdvertisement,
  TuiSessionSummary,
  TuiSessionOpenResult,
  TuiModel,
  TuiModelProviderGroup,
  TuiModelCatalogFailure,
  TuiModelCatalog,
  TuiImageMediaType,
  TuiImageAttachmentRef,
  TuiImageInput,
  TuiCapabilitySnapshot,
  TuiRuntimeCapabilities,
  TuiRuntimeCapabilityName,
  SubagentFinished,
  TuiInitialize,
  TuiLaunch,
  TuiNotification,
  TuiRuntime,
} from './types.ts'

/** @deprecated Use TuiLaunch. Kept for the scaffold call site. */
export type { TuiLaunch as HarnessJsonRpcLaunch } from './types.ts'
