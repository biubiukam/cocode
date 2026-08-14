/**
 * Runtime services. There is no god object — each domain is a Cordis plugin.
 */

export type { ConnectionSnapshot } from './connection/controller.ts'
export { ConnectionController } from './connection/controller.ts'
export type { ConnectionFailure, ConnectionPhase } from './connection/controller.ts'
export { ConnectionService } from './connection/service.ts'
export { SessionStore } from './sessions/session-store.ts'
export type { SessionStoreSnapshot, WorkspaceGroup, FrameHandler } from './sessions/session-store.ts'
export { Session } from './sessions/session.ts'
export type { PendingQuestion, QuestionAnswer, SessionSnapshot } from './sessions/session.ts'
export { blocksToText, reasoningToText } from './sessions/conversation.ts'
export type {
  AssistantNode,
  CommandNode,
  ConversationNode,
  FallbackNode,
  NoticeNode,
  PendingToolApproval,
  ToolNode,
  ToolNodeStatus,
  UserNode,
} from './sessions/conversation.ts'
export { PanelRegistry } from './panels/registry.ts'
export type { PanelDescriptor, PanelScope } from './panels/registry.ts'
export { createLayoutStore } from './layout/store.ts'
export { LayoutService } from './layout/service.ts'
export type { LayoutActions, LayoutStore, LayoutStoreState, OpenPanelOptions, TabAddress } from './layout/store.ts'
export * from './layout/types.ts'
export { ShortcutRegistry, formatCombo } from './shortcuts/registry.ts'
export type { Combo, ShortcutDefinition } from './shortcuts/registry.ts'
export { FocusTracker, focusZoneAttribute } from './focus/zones.ts'
export type { FocusZone } from './focus/zones.ts'
export { CommandCatalog, commandNameOf, isCommandLine } from './commands/catalog.ts'
export type { CommandCatalogSnapshot } from './commands/catalog.ts'
export { isTerminalMuxFrame, TerminalBuffer, TerminalStore } from './terminals/store.ts'
export type { TerminalMuxFrame } from './terminals/store.ts'
export {
  DEFAULT_WEB_SEARCH_API_KEY_REF,
  PLUGIN_SETTING_NAMESPACES,
  PluginSettingsStore,
  webSearchApiKeyRef,
} from './plugin-settings/store.ts'
export type {
  PluginCredential,
  PluginSection,
  PluginSettingsNamespace,
  PluginSettingsSnapshot,
} from './plugin-settings/store.ts'
export { Notifier, Observable } from './notifier.ts'
export type { Publication } from './notifier.ts'
export { SlotService } from './slots/service.ts'
export type { SlotEntry, SlotKind, SlotRegisterOptions, SlotSpec } from './slots/service.ts'
export { NodeRegistry } from './nodes/registry.ts'
export { ConversationNodeAssembler } from './nodes/assembler.ts'
export type { ConversationNodeDefinition, ConversationMatch } from './nodes/types.ts'
