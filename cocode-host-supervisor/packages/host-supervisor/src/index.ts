export * from './protocol.js'
export * from './client.js'
export { isLeaseActive, type LeaseRecord } from './lifecycle.js'
export {
  addRuntimePluginDependencies,
  createRuntimePatch,
  mergeHostRuntimeEnv,
  prepareRuntimeSlot,
  ensureCocodeProfile,
  type RuntimePluginEntry,
  type RuntimeSlot,
} from './runtime.js'
export { connectJsonRpc, type JsonRpcPeer } from './socket-jsonrpc-client.js'
export {
  createExternalDshReadSource,
  ExternalDshReader,
  type ExternalDshReadSource,
  type ExternalDshReadSourceOptions,
  type ExternalDshSourceStatus,
  type ExternalDshChange,
  type ExternalDshConflictStatus,
  type ExternalSessionSummary,
  type ExternalSessionHistory,
  type ExternalSessionEvent,
  type ExternalWorkspace,
  type ExternalWorkspaceSnapshot,
  type ExternalProjectionSnapshot,
  type ExternalAttachmentRef,
  type VerifiedAttachment,
} from './external-dsh-reader.js'
