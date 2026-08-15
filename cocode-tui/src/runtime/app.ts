/**
 * TuiApp owns session lifecycle, projection, and local queues.
 */

import type {
  SkillEntry,
  TuiNotification,
  TuiQuestionAnswer,
  TuiQuestionItem,
  TuiQuestionRequest,
  TuiCapabilitySnapshot,
  TuiRuntime,
} from '@cocode/tui-connection'
import type { SelectModeResult } from './auth/store.ts'
import type { AuthSnapshot, ResolvedAuth } from './auth/types.ts'
import { createAssembler, type Assembler } from './assembler.ts'
import { P0_CAPABILITIES, type TuiCapabilities } from './capabilities.ts'
import {
  CommandRegistry,
  commandSummary,
  createBuiltinCommands,
  helpText,
  parseSlash,
} from './commands.ts'
import { InputHistory } from './history.ts'
import type { ConversationNode } from './nodes/types.ts'
import {
  backspaceDraft,
  createDraft,
  insertDraft,
  moveDraftCursor,
  replaceDraftRange,
  replaceDraft,
  type DraftState,
} from './draft.ts'
import { buildPromptBlocks, loadFileContext } from './file-context.ts'
import { replaySessionEvents } from './sessions-fs.ts'
import { createSessionStateProjector, type SessionGoal, type SessionTodo } from './session-state.ts'
import { formatFileMention } from './file-mentions.ts'
import { resolveWorkspaceInfo } from './workspace.ts'
import { createAppCommandContext } from './command-context.ts'
import {
  composerPlaceholder,
  errorMessage,
  latestUsage,
  startErrorMessage,
  statusLine,
} from './app-view.ts'
import { handleInterrupt } from './interrupt.ts'
import { closeRuntime } from './lifecycle.ts'
import { handleNotification } from './notification.ts'
import { errorNotice } from './errors/index.ts'
import { redactSecrets } from './diagnostics.ts'
import { localeName, parseUiLocale, text, type UiLocale } from './ui-locale.ts'
import {
  closeResumePicker,
  createResumePicker,
  moveResumeSelection,
  selectedResumeItem,
  setResumeQuery,
  type ResumePickerState,
} from './resume-picker.ts'
import {
  closeRewindPicker,
  confirmRewindSelection,
  createRewindPicker,
  moveRewindSelection,
  selectedRewindItem,
  type RewindPickerState,
} from './rewind-picker.ts'
import {
  closeSkillsPicker,
  createSkillsPicker,
  moveSkillsSelection,
  selectedSkill,
  setSkillsQuery,
  type SkillsPickerState,
} from './skills-picker.ts'
import {
  logoutChannel,
  requestChannelSwitch,
  submitCapturedByok,
  type ChannelSwitchHost,
} from './channel-switch.ts'
import { createTelemetryProjector, type TelemetrySnapshot } from './telemetry.ts'
import { copyToClipboard, readableNodeText } from './clipboard.ts'
import { notifyTerminal, type TerminalNotifyMode } from './terminal-notify.ts'

export type TuiAction =
  | { type: 'submit'; text: string }
  | { type: 'compact' }
  | { type: 'command'; line: string }
  | { type: 'setDraft'; text: string }
  | { type: 'insertDraft'; text: string }
  | { type: 'deleteBackward' }
  | { type: 'moveCursor'; delta: number }
  | { type: 'attachFile'; start: number; end: number; path: string }
  | { type: 'historyPrev' }
  | { type: 'historyNext' }
  | { type: 'toggleVerbose' }
  | { type: 'toggleHelp' }
  | { type: 'interruptOrQuit' }
  | { type: 'quit' }
  | { type: 'redraw' }
  | { type: 'resume.setQuery'; query: string }
  | { type: 'resume.move'; delta: number }
  | { type: 'resume.close' }
  | { type: 'resume.confirm' }
  | { type: 'rewind.open' }
  | { type: 'rewind.move'; delta: number }
  | { type: 'rewind.close' }
  | { type: 'rewind.confirm' }
  | { type: 'skills.setQuery'; query: string }
  | { type: 'skills.move'; delta: number }
  | { type: 'skills.close' }
  | { type: 'skills.confirm' }
  | { type: 'question.answer'; selected: string[]; custom?: string }
  | { type: 'question.cancel' }
  | { type: 'queuePrompt' }
  | { type: 'copyNode'; nodeKey: string }

export type { TuiCapabilities }

export type TuiSnapshot = {
  header: {
    product: 'Cocode'
    sessionId: string
    model: string
    provider: string
    cwd: string
    branch?: string
  }
  agent: 'idle' | 'running' | 'starting' | 'dead'
  nodes: readonly ConversationNode[]
  history: readonly string[]
  locale: UiLocale
  composer: {
    text: string
    cursor: number
    placeholder: string
    disabled: boolean
    mask?: boolean
    attachments: readonly string[]
  }
  status: {
    line: string
    tokens?: { input: number; output: number }
    telemetry: TelemetrySnapshot
    todos: readonly SessionTodo[]
    goal?: SessionGoal
    sessionTitle?: string
    agentPreset?: string
    transcript?: { evicted: number }
    subagents?: TuiSubagentActivity
    queueCount: number
    focusMode: boolean
  }
  helpOpen: boolean
  verbose: boolean
  capabilities: TuiCapabilities
  notice?: { tone: 'info' | 'error'; message: string }
  helpText: string
  commands: readonly { name: string; summary: string }[]
  resumePicker?: ResumePickerState
  rewindPicker?: RewindPickerState
  skillsPicker?: SkillsPickerState
  skills: readonly SkillEntry[]
  question?: TuiQuestionSnapshot
  exiting: boolean
}

export type TuiQuestionSnapshot = {
  key: string
  sessionId: string
  question: TuiQuestionItem
  position: number
  total: number
  answered: number
}

export type TuiSubagentActivity = {
  running: number
  last?: { id: string; event: 'started' | 'finished' }
}

type QueuedPrompt = {
  text: string
  attachments: readonly { path: string; token: string }[]
}

type PendingQuestion = {
  id: number
  request: TuiQuestionRequest
  index: number
  answers: TuiQuestionAnswer['answers']
  resolve: (answer: TuiQuestionAnswer) => void
  reject: (error: Error) => void
}

export type TuiAuthInfo = {
  mode: 'byok' | 'cocode'
  envLocked: boolean
  accountLabel?: string
  logout: () => Promise<void>
  selectMode?: (mode: 'byok' | 'cocode') => Promise<SelectModeResult>
  exclusiveHome?: () => Promise<boolean>
  login?: () => void
  submitByok?: (key: string) => Promise<void>
  resolved?: () => ResolvedAuth
  snapshot?: () => AuthSnapshot
  subscribe?: (listener: () => void) => () => void
}

export type TuiCommandCtx = {
  dispatch: (action: TuiAction) => void
  newSession: () => void
  clearTranscript: () => void
  showStatus: () => void
  notice: (tone: 'info' | 'error', message: string) => void
  logout: () => Promise<void>
  useAuth?: (target: 'byok' | 'cocode' | 'login') => void
  showDoctor?: () => void
  exportTranscript?: () => Promise<void>
  initWorkspace?: () => Promise<void>
  setTheme?: (name: 'dark' | 'light') => void
  setLocale?: (value: string) => void
  setModel?: (value: string) => void
  resumeSessions?: () => Promise<void>
  showSkillsPicker?: () => void
  copyLatestAssistant?: () => void
  toggleFocus?: () => void
}

export type TuiApp = {
  start(): Promise<void>
  close(): Promise<void>
  snapshot(): TuiSnapshot
  subscribe(listener: () => void): () => void
  dispatch(action: TuiAction): void
}

export type TuiAppOptions = {
  runtime: TuiRuntime
  cwd: string
  provider: string
  model: string
  sessionId?: string
  capabilities?: TuiCapabilities
  commands?: CommandRegistry
  auth?: TuiAuthInfo
  diagnostics?: {
    tty: boolean
    launchConfigured: boolean
    argsConfigured: boolean
    sessionRoot?: string
  }
  setTheme?: (name: 'dark' | 'light') => void
  locale?: UiLocale
  terminalNotify?: {
    mode?: TerminalNotifyMode
    write?: (value: string) => void
  }
}

export function createTuiApp(options: TuiAppOptions): TuiApp {
  return new TuiAppImpl(options)
}

class TuiAppImpl implements TuiApp {
  private readonly runtime: TuiRuntime
  private readonly cwd: string
  private provider: string
  private model: string
  private readonly configuredCapabilities: TuiCapabilities
  private capabilities: TuiCapabilities
  private runtimeCapabilitySnapshot: TuiCapabilitySnapshot | undefined
  private readonly commands: CommandRegistry
  private assembler: Assembler
  private telemetry = createTelemetryProjector()
  private sessionState = createSessionStateProjector()
  private readonly history = new InputHistory()
  private readonly listeners = new Set<() => void>()
  private unsubscribeRuntime: (() => void) | undefined
  private unsubscribeRuntimeClose: (() => void) | undefined
  private unsubscribeQuestion: (() => void) | undefined
  private sessionId: string
  private agent: TuiSnapshot['agent'] = 'starting'
  private draft: DraftState = createDraft()
  private attachments: Array<{ path: string; token: string }> = []
  private helpOpen = false
  private verbose = false
  private focusMode = false
  private notice: TuiSnapshot['notice']
  private interruptArmed = false
  private exiting = false
  private runtimeName = ''
  private initError: string | undefined
  private workspaceBranch: string | undefined
  private readonly diagnostics: NonNullable<TuiAppOptions['diagnostics']>
  private readonly themeSetter: TuiAppOptions['setTheme']
  private locale: UiLocale
  private readonly auth: TuiAuthInfo | undefined
  private readonly terminalNotify: NonNullable<TuiAppOptions['terminalNotify']>
  private readonly activeSubagents = new Set<string>()
  private lastSubagent: TuiSubagentActivity['last']
  private readonly queuedPrompts: QueuedPrompt[] = []
  private capturingByok = false
  private emitScheduled = false
  private closePromise: Promise<void> | undefined
  private resumePicker: ResumePickerState | undefined
  private rewindPicker: RewindPickerState | undefined
  private skillsPicker: SkillsPickerState | undefined
  private skills: SkillEntry[] = []
  private readonly questionQueue: PendingQuestion[] = []
  private activeQuestion: PendingQuestion | undefined
  private questionSerial = 0

  constructor(options: TuiAppOptions) {
    this.runtime = options.runtime
    this.cwd = options.cwd
    this.provider = options.provider
    this.model = options.model
    this.sessionId = options.sessionId ?? crypto.randomUUID()
    this.configuredCapabilities = options.capabilities ?? P0_CAPABILITIES
    this.capabilities = this.configuredCapabilities
    this.commands = options.commands ?? createBuiltinCommands()
    this.assembler = createAssembler()
    this.auth = options.auth
    this.diagnostics = options.diagnostics ?? {
      tty: true,
      launchConfigured: true,
      argsConfigured: true,
    }
    this.themeSetter = options.setTheme
    this.locale = options.locale ?? 'en'
    this.terminalNotify =
      options.terminalNotify ?? (process.stdout.isTTY === true ? {} : { mode: 'off' })
  }

  async start(): Promise<void> {
    this.agent = 'starting'
    this.emit()
    this.unsubscribeRuntime = this.runtime.subscribe((n) => this.onNotification(n))
    this.unsubscribeQuestion = this.runtime.onQuestion?.((request) => this.askQuestion(request))
    this.unsubscribeRuntimeClose = this.runtime.onClose?.((error) => {
      if (this.exiting) return
      this.agent = 'dead'
      this.notice = errorNotice(
        'RUNTIME_STOPPED',
        error === undefined ? {} : { detail: redactSecrets(error) },
      )
      this.emit()
    })
    try {
      const info = await this.runtime.start({
        cwd: this.cwd,
        provider: this.provider,
        model: this.model,
      })
      if (this.exiting) return
      this.runtimeName = info.name
      this.refreshRuntimeCapabilities()
      this.agent = 'idle'
      this.initError = undefined
      this.notice = undefined
      this.workspaceBranch = (await resolveWorkspaceInfo(this.cwd)).branch
      await this.loadSkills()
      if (this.exiting) return
    } catch (error) {
      if (this.exiting) return
      this.agent = 'dead'
      this.initError = errorMessage(error)
      this.notice = {
        tone: 'error',
        message: startErrorMessage(error),
      }
    }
    this.emit()
  }

  async close(): Promise<void> {
    this.closePromise ??= this.closeRuntime()
    return this.closePromise
  }

  private async closeRuntime(): Promise<void> {
    await closeRuntime({
      unsubscribe: () => {
        this.unsubscribeRuntime?.()
        this.unsubscribeRuntime = undefined
        this.unsubscribeQuestion?.()
        this.unsubscribeQuestion = undefined
        this.rejectQuestions(new Error('TUI closed before the question was answered'))
      },
      unsubscribeClose: () => {
        this.unsubscribeRuntimeClose?.()
        this.unsubscribeRuntimeClose = undefined
      },
      runtimeClose: () => this.runtime.close(),
      markDead: () => {
        this.agent = 'dead'
        this.emit()
      },
    })
  }

  snapshot(): TuiSnapshot {
    const disabled = this.agent === 'dead' || this.exiting
    const telemetry = this.telemetry.snapshot()
    const sessionState = this.sessionState.snapshot()
    const assemblerStats = this.assembler.stats()
    return {
      header: {
        product: 'Cocode',
        sessionId: this.sessionId,
        model: this.model,
        provider: this.provider,
        cwd: this.cwd,
        branch: this.workspaceBranch,
      },
      agent: this.agent,
      nodes: this.assembler.snapshot(),
      history: this.history.entriesSnapshot(),
      locale: this.locale,
      composer: {
        text: this.capturingByok ? '*'.repeat(this.draft.text.length) : this.draft.text,
        cursor: this.draft.cursor,
        placeholder: this.capturingByok
          ? '粘贴 API Key，回车确认'
          : composerPlaceholder(this.agent, this.locale),
        disabled,
        attachments: this.attachments.map((attachment) => attachment.path),
        ...(this.capturingByok ? { mask: true } : {}),
      },
      status: {
        line: statusLine(this.agent, this.runtimeName, this.locale),
        tokens:
          telemetry.usage === undefined
            ? latestUsage(this.assembler.snapshot())
            : {
                input: telemetry.usage.input,
                output: telemetry.usage.output,
              },
        telemetry,
        todos: sessionState.todos,
        ...(sessionState.goal === undefined ? {} : { goal: sessionState.goal }),
        ...(sessionState.title === undefined ? {} : { sessionTitle: sessionState.title }),
        ...(sessionState.agentPreset === undefined
          ? {}
          : { agentPreset: sessionState.agentPreset }),
        ...(assemblerStats.evictedNodes === 0
          ? {}
          : { transcript: { evicted: assemblerStats.evictedNodes } }),
        subagents: {
          running: this.activeSubagents.size,
          ...(this.lastSubagent === undefined ? {} : { last: this.lastSubagent }),
        },
        queueCount: this.queuedPrompts.length,
        focusMode: this.focusMode,
      },
      helpOpen: this.helpOpen,
      verbose: this.verbose,
      capabilities: this.capabilities,
      notice: this.notice,
      helpText: helpText(this.capabilities, this.commands, this.locale),
      commands: this.commands.list(this.capabilities).map((command) => ({
        name: command.name,
        summary: commandSummary(command, this.locale),
      })),
      resumePicker: this.resumePicker,
      rewindPicker: this.rewindPicker,
      skillsPicker: this.skillsPicker,
      skills: this.skills,
      question: this.questionSnapshot(),
      exiting: this.exiting,
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  dispatch(action: TuiAction): void {
    switch (action.type) {
      case 'setDraft':
        this.draft = replaceDraft(this.draft, action.text)
        this.interruptArmed = false
        this.pruneAttachments()
        this.emit()
        return
      case 'insertDraft':
        this.draft = insertDraft(this.draft, action.text)
        this.interruptArmed = false
        this.pruneAttachments()
        this.emit()
        return
      case 'deleteBackward':
        this.draft = backspaceDraft(this.draft)
        this.interruptArmed = false
        this.pruneAttachments()
        this.emit()
        return
      case 'moveCursor':
        this.draft = moveDraftCursor(this.draft, action.delta)
        this.emit()
        return
      case 'attachFile': {
        const token = formatFileMention(action.path)
        this.draft = replaceDraftRange(this.draft, action.start, action.end, `${token} `)
        this.attachments = [
          ...this.attachments.filter((attachment) => attachment.path !== action.path),
          { path: action.path, token },
        ]
        this.emit()
        return
      }
      case 'submit':
        this.submit(action.text)
        return
      case 'compact':
        this.requestCompact()
        return
      case 'command':
        this.runCommand(action.line)
        return
      case 'historyPrev': {
        const next = this.history.prev(this.draft.text)
        if (next !== undefined) {
          this.draft = replaceDraft(this.draft, next)
          this.interruptArmed = false
        }
        this.emit()
        return
      }
      case 'historyNext': {
        const next = this.history.next(this.draft.text)
        if (next !== undefined) {
          this.draft = replaceDraft(this.draft, next)
          this.interruptArmed = false
        }
        this.emit()
        return
      }
      case 'toggleVerbose':
        this.verbose = !this.verbose
        this.emit()
        return
      case 'toggleHelp':
        this.helpOpen = !this.helpOpen
        this.emit()
        return
      case 'interruptOrQuit':
        this.interruptOrQuit()
        return
      case 'quit':
        this.beginQuit()
        return
      case 'redraw':
        this.emit()
        return
      case 'resume.setQuery':
        if (this.resumePicker !== undefined) {
          this.resumePicker = setResumeQuery(this.resumePicker, action.query)
          this.emit()
        }
        return
      case 'resume.move':
        if (this.resumePicker !== undefined) {
          this.resumePicker = moveResumeSelection(this.resumePicker, action.delta)
          this.emit()
        }
        return
      case 'resume.close':
        if (this.resumePicker !== undefined) {
          this.resumePicker = closeResumePicker(this.resumePicker)
          this.emit()
        }
        return
      case 'resume.confirm': {
        if (this.resumePicker === undefined) return
        const selected = selectedResumeItem(this.resumePicker)
        this.resumePicker = closeResumePicker(this.resumePicker)
        if (selected !== undefined) {
          void this.resumeSession(selected.id, selected.path)
        }
        this.emit()
        return
      }
      case 'rewind.open':
        this.openRewindPicker()
        return
      case 'rewind.move':
        if (this.rewindPicker !== undefined) {
          this.rewindPicker = moveRewindSelection(this.rewindPicker, action.delta)
          this.emit()
        }
        return
      case 'rewind.close':
        if (this.rewindPicker !== undefined) {
          this.rewindPicker = closeRewindPicker(this.rewindPicker)
          this.emit()
        }
        return
      case 'rewind.confirm':
        if (this.rewindPicker === undefined) return
        if (!this.rewindPicker.confirming) {
          this.rewindPicker = confirmRewindSelection(this.rewindPicker)
          this.emit()
          return
        }
        {
          const selected = selectedRewindItem(this.rewindPicker)
          this.rewindPicker = closeRewindPicker(this.rewindPicker)
          if (selected !== undefined) void this.rewindSession(selected)
          this.emit()
        }
        return
      case 'skills.setQuery':
        if (this.skillsPicker !== undefined) {
          this.skillsPicker = setSkillsQuery(this.skillsPicker, action.query)
          this.emit()
        }
        return
      case 'skills.move':
        if (this.skillsPicker !== undefined) {
          this.skillsPicker = moveSkillsSelection(this.skillsPicker, action.delta)
          this.emit()
        }
        return
      case 'skills.close':
        if (this.skillsPicker !== undefined) {
          this.skillsPicker = closeSkillsPicker(this.skillsPicker)
          this.emit()
        }
        return
      case 'skills.confirm': {
        if (this.skillsPicker === undefined) return
        const skill = selectedSkill(this.skillsPicker)
        this.skillsPicker = closeSkillsPicker(this.skillsPicker)
        if (skill !== undefined) {
          this.draft = replaceDraft(this.draft, `/${skill.name} `)
          this.attachments = []
          this.notice = {
            tone: 'info',
            message: text(this.locale, 'skillReady', { name: skill.name }),
          }
        }
        this.emit()
        return
      }
      case 'question.answer':
        this.answerQuestion(action.selected, action.custom)
        return
      case 'question.cancel':
        this.cancelQuestion()
        return
      case 'queuePrompt':
        this.queueCurrentPrompt()
        return
      case 'copyNode':
        this.copyNode(action.nodeKey)
        return
    }
  }

  private interruptOrQuit(): void {
    handleInterrupt({
      helpOpen: this.helpOpen,
      agentRunning: this.agent === 'running',
      canCancel: this.capabilities.cancel,
      armed: this.interruptArmed,
      close: () => this.beginQuit(),
      setHelpOpen: (open) => {
        this.helpOpen = open
      },
      setArmed: (armed) => {
        this.interruptArmed = armed
      },
      notice: (message) => {
        this.notice = { tone: 'info', message }
      },
      cancel: () => this.runtime.cancel(this.sessionId),
      cancelAccepted: (wasRunning) => {
        this.notice = {
          tone: 'info',
          message: wasRunning
            ? text(this.locale, 'cancelRequested')
            : text(this.locale, 'cancelNotRunning'),
        }
        if (!wasRunning) this.interruptArmed = false
      },
      cancelFailed: (error) => {
        this.notice = {
          tone: 'error',
          message: `${text(this.locale, 'cancelFailed')}: ${errorMessage(error)}`,
        }
      },
      emptyComposer: this.draft.text.trim() === '',
      canRewind:
        this.capabilities.rewind &&
        this.assembler.snapshot().filter((node) => node.kind === 'user').length > 1,
      rewind: () => this.dispatch({ type: 'rewind.open' }),
      rewindNotice: text(this.locale, 'rewindArm'),
      rewindUnavailable: text(this.locale, 'rewindUnavailable'),
      emit: () => this.emit(),
    })
  }

  private commandCtx(): TuiCommandCtx {
    return createAppCommandContext({
      dispatch: (action) => this.dispatch(action),
      newSession: () => {
        this.sessionId = crypto.randomUUID()
        this.assembler.reset()
        this.telemetry.reset()
        this.sessionState.reset()
        this.resetSubagentActivity()
        this.queuedPrompts.length = 0
        this.attachments = []
        this.notice = {
          tone: 'info',
          message: `New session ${this.sessionId}`,
        }
        this.emit()
      },
      clearTranscript: () => {
        this.assembler.reset()
        this.telemetry.reset()
        this.sessionState.reset()
        this.attachments = []
        this.notice = { tone: 'info', message: 'Transcript cleared' }
        this.emit()
      },
      showStatus: () => {
        const authBits =
          this.auth === undefined
            ? []
            : [
                `auth: ${this.auth.mode}`,
                this.auth.envLocked ? 'env-locked' : undefined,
                this.auth.accountLabel === undefined
                  ? undefined
                  : `account: ${this.auth.accountLabel}`,
                this.auth.snapshot?.()?.channels?.byok === true ? 'byok-configured' : undefined,
                this.auth.snapshot?.()?.channels?.cocode === true ? 'cocode-configured' : undefined,
              ].filter((bit): bit is string => bit !== undefined)
        this.notice = {
          tone: 'info',
          message: [
            `session ${this.sessionId}`,
            `${this.provider}/${this.model}`,
            this.agent,
            this.runtimeName === '' ? 'runtime offline' : this.runtimeName,
            ...authBits,
          ].join(' · '),
        }
        this.emit()
      },
      notice: (tone, message) => {
        this.notice = { tone, message }
        this.emit()
      },
      logout: () => logoutChannel(this.switchHost()),
      useAuth: (target) => requestChannelSwitch(this.switchHost(), target),
      initError: this.initError,
      capabilities: this.capabilities,
      configuredCapabilities: this.configuredCapabilities,
      runtimeCapabilities: this.runtimeCapabilitySnapshot,
      cwd: this.cwd,
      provider: this.provider,
      model: this.model,
      runtimeName: this.runtimeName,
      diagnostics: this.diagnostics,
      auth: this.auth,
      sessionId: () => this.sessionId,
      nodes: this.assembler.snapshot(),
      setTheme: (name) => {
        this.themeSetter?.(name)
        this.notice = {
          tone: 'info',
          message:
            this.themeSetter === undefined ? 'Theme switching is unavailable.' : `Theme: ${name}`,
        }
        this.emit()
      },
      setLocale: (value) => {
        const locale = parseUiLocale(value)
        if (locale === undefined) {
          this.notice = { tone: 'info', message: text(this.locale, 'langUsage') }
          this.emit()
          return
        }
        this.locale = locale
        this.notice = {
          tone: 'info',
          message: text(this.locale, 'langChanged', { lang: localeName(locale) }),
        }
        this.emit()
      },
      setModel: (value) => {
        const model = value.trim()
        if (model === '') {
          this.notice = { tone: 'info', message: text(this.locale, 'modelUsage') }
          this.emit()
          return
        }
        if (this.agent === 'running' || this.agent === 'starting') {
          this.notice = { tone: 'info', message: text(this.locale, 'modelBusy') }
          this.emit()
          return
        }
        void this.switchModel(model)
      },
      locale: this.locale,
      showResumePicker: (sessions) => {
        this.helpOpen = false
        this.notice = undefined
        this.resumePicker = createResumePicker(
          sessions.map((session) => ({
            id: session.id,
            createdAt: session.createdAt,
            preview: session.preview ?? session.cwd,
            path: session.path,
          })),
        )
        this.emit()
      },
      showSkillsPicker: () => {
        if (!this.capabilities.skills) {
          this.notice = { tone: 'info', message: text(this.locale, 'skillsUnavailable') }
          this.emit()
          return
        }
        this.helpOpen = false
        this.notice = undefined
        this.skillsPicker = createSkillsPicker(this.skills)
        this.emit()
      },
      copyLatestAssistant: () => {
        const node = [...this.assembler.snapshot()]
          .reverse()
          .find((candidate) => candidate.kind === 'assistant' && candidate.text !== '')
        if (node === undefined) {
          this.notice = { tone: 'info', message: text(this.locale, 'copyEmpty') }
          this.emit()
          return
        }
        this.copyText(readableNodeText(node))
      },
      toggleFocus: () => {
        this.focusMode = !this.focusMode
        this.notice = {
          tone: 'info',
          message: text(this.locale, this.focusMode ? 'focusEnabled' : 'focusDisabled'),
        }
        this.emit()
      },
    })
  }

  private copyNode(key: string): void {
    const node = this.assembler
      .snapshot()
      .find((candidate) => `${candidate.kind}:${candidate.id}` === key)
    const value = node === undefined ? '' : readableNodeText(node)
    if (value === '') {
      this.notice = { tone: 'info', message: text(this.locale, 'copyEmpty') }
      this.emit()
      return
    }
    this.copyText(value)
  }

  private copyText(value: string): void {
    void copyToClipboard(value).then((result) => {
      this.notice = result.ok
        ? { tone: 'info', message: text(this.locale, 'copySuccess') }
        : { tone: 'error', message: text(this.locale, 'copyUnavailable') }
      this.emit()
    })
  }

  private async loadSkills(): Promise<void> {
    if (
      this.runtimeCapabilitySnapshot?.source === 'runtime' &&
      !this.runtimeCapabilitySnapshot.capabilities.skills
    ) {
      this.capabilities = { ...this.capabilities, skills: false }
      this.skills = []
      return
    }
    const listSkills = this.runtime.listSkills
    if (listSkills === undefined) {
      this.capabilities = { ...this.capabilities, skills: false }
      this.skills = []
      return
    }
    try {
      this.skills = await listSkills.call(this.runtime, this.sessionId)
      this.capabilities = { ...this.capabilities, skills: this.skills.length > 0 }
    } catch {
      this.skills = []
      this.capabilities = { ...this.capabilities, skills: false }
    }
  }

  private refreshRuntimeCapabilities(): void {
    this.runtimeCapabilitySnapshot = this.runtime.getCapabilities?.()
    if (this.runtimeCapabilitySnapshot?.source === 'runtime') {
      this.capabilities = applyRuntimeCapabilities(
        this.configuredCapabilities,
        this.runtimeCapabilitySnapshot,
      )
    }
  }

  private askQuestion(request: TuiQuestionRequest): Promise<TuiQuestionAnswer> {
    return new Promise<TuiQuestionAnswer>((resolve, reject) => {
      this.questionQueue.push({
        id: ++this.questionSerial,
        request,
        index: 0,
        answers: [],
        resolve,
        reject,
      })
      this.startNextQuestion()
    })
  }

  private startNextQuestion(): void {
    if (this.activeQuestion !== undefined || this.questionQueue.length === 0) return
    this.activeQuestion = this.questionQueue.shift()
    this.emit()
  }

  private questionSnapshot(): TuiQuestionSnapshot | undefined {
    const active = this.activeQuestion
    if (active === undefined) return undefined
    const question = active.request.questions[active.index]
    if (question === undefined) return undefined
    return {
      key: `${active.id}-${active.index}`,
      sessionId: active.request.sessionId,
      question,
      position: active.index + 1,
      total: active.request.questions.length,
      answered: active.answers.length,
    }
  }

  private answerQuestion(selected: string[], custom?: string): void {
    const active = this.activeQuestion
    const question = active?.request.questions[active.index]
    if (active === undefined || question === undefined) return
    active.answers.push({
      id: question.id,
      selected: [...selected],
      ...(custom === undefined || custom.trim() === '' ? {} : { custom: custom.trim() }),
    })
    active.index += 1
    if (active.index >= active.request.questions.length) {
      this.activeQuestion = undefined
      active.resolve({ answers: [...active.answers] })
      this.startNextQuestion()
    }
    this.emit()
  }

  private cancelQuestion(): void {
    const active = this.activeQuestion
    if (active === undefined) return
    this.activeQuestion = undefined
    active.reject(new Error('ask_user_question was interrupted before the user answered'))
    this.startNextQuestion()
    this.emit()
  }

  private rejectQuestions(error: Error): void {
    const active = this.activeQuestion
    this.activeQuestion = undefined
    if (active !== undefined) active.reject(error)
    for (const pending of this.questionQueue.splice(0)) pending.reject(error)
    this.emit()
  }

  private async switchModel(model: string): Promise<void> {
    const previous = this.model
    this.agent = 'starting'
    this.notice = {
      tone: 'info',
      message: text(this.locale, 'modelSwitching', { model }),
    }
    this.emit()
    try {
      const info = await this.runtime.restart({ cwd: this.cwd, provider: this.provider, model })
      this.model = model
      this.runtimeName = info.name
      this.refreshRuntimeCapabilities()
      this.sessionId = crypto.randomUUID()
      this.assembler.reset()
      this.telemetry.reset()
      this.sessionState.reset()
      this.resetSubagentActivity()
      this.queuedPrompts.length = 0
      this.agent = 'idle'
      this.notice = {
        tone: 'info',
        message: text(this.locale, 'modelChanged', { model }),
      }
    } catch (error) {
      this.agent = 'dead'
      this.notice = { tone: 'error', message: errorMessage(error) }
      try {
        const info = await this.runtime.restart({
          cwd: this.cwd,
          provider: this.provider,
          model: previous,
        })
        this.model = previous
        this.runtimeName = info.name
        this.refreshRuntimeCapabilities()
        this.agent = 'idle'
        this.notice = {
          tone: 'error',
          message: text(this.locale, 'modelRestored', { model: previous }),
        }
      } catch (restoreError) {
        this.notice = { tone: 'error', message: startErrorMessage(restoreError) }
      }
    }
    this.emit()
  }

  private async resumeSession(sessionId: string, path: string | undefined): Promise<void> {
    if (path === undefined) {
      this.notice = {
        tone: 'error',
        message: text(this.locale, 'resumeUnavailable', { session: sessionId.slice(0, 8) }),
      }
      this.emit()
      return
    }
    this.agent = 'starting'
    this.notice = { tone: 'info', message: text(this.locale, 'resumeLoading') }
    this.emit()
    try {
      const previousSessionId = this.sessionId
      const nextAssembler = createAssembler()
      const nextTelemetry = createTelemetryProjector()
      const nextSessionState = createSessionStateProjector()
      await replaySessionEvents(path, (event) => {
        nextAssembler.ingest(event)
        nextTelemetry.ingest(event)
        nextSessionState.ingest(event)
      })
      await this.runtime.open(sessionId, previousSessionId)
      this.sessionId = sessionId
      this.assembler = nextAssembler
      this.telemetry = nextTelemetry
      this.sessionState = nextSessionState
      this.resetSubagentActivity()
      this.queuedPrompts.length = 0
      this.attachments = []
      this.agent = 'idle'
      this.notice = {
        tone: 'info',
        message: text(this.locale, 'resumeLoaded', { session: sessionId.slice(0, 8) }),
      }
    } catch (error) {
      this.agent = 'idle'
      this.notice = { tone: 'error', message: errorMessage(error) }
    }
    this.emit()
  }

  private openRewindPicker(): void {
    const users = this.assembler
      .snapshot()
      .filter((node): node is Extract<ConversationNode, { kind: 'user' }> => node.kind === 'user')
    const items = users
      .slice(1)
      .reverse()
      .map((node) => ({ id: node.id, seq: node.seq, text: node.text }))
    if (items.length === 0) {
      this.notice = { tone: 'info', message: text(this.locale, 'rewindEmpty') }
      this.emit()
      return
    }
    this.rewindPicker = createRewindPicker(items)
    this.helpOpen = false
    this.notice = undefined
    this.emit()
  }

  private async rewindSession(item: { seq: number; text: string }): Promise<void> {
    const previousSessionId = this.sessionId
    this.agent = 'starting'
    this.notice = { tone: 'info', message: text(this.locale, 'rewindLoading') }
    this.emit()
    try {
      const result = await this.runtime.rewind(previousSessionId, item.seq, previousSessionId)
      this.sessionId = result.sessionId
      this.assembler.replaceWindow(result.seed)
      this.telemetry.reset()
      this.sessionState.reset()
      for (const event of result.seed) {
        this.telemetry.ingest(event)
        this.sessionState.ingest(event)
      }
      this.resetSubagentActivity()
      this.queuedPrompts.length = 0
      this.attachments = []
      this.draft = replaceDraft(this.draft, item.text)
      this.agent = 'idle'
      this.notice = { tone: 'info', message: text(this.locale, 'rewindLoaded') }
    } catch (error) {
      this.agent = 'idle'
      this.notice = { tone: 'error', message: errorMessage(error) }
    }
    this.emit()
  }

  private submit(inputText: string): void {
    const trimmed = inputText.trim()
    if (trimmed === '') return
    if (this.capturingByok) {
      void submitCapturedByok(this.switchHost(), trimmed)
      return
    }
    if (trimmed.startsWith('/')) {
      this.runCommand(trimmed)
      return
    }
    if (this.agent !== 'idle') {
      this.notice = {
        tone: 'info',
        message: text(this.locale, 'turnBusy'),
      }
      this.emit()
      return
    }
    const attachments = this.attachments.slice()
    this.history.push(trimmed)
    this.draft = createDraft()
    this.attachments = []
    this.notice = undefined
    this.interruptArmed = false
    void this.promptWithAttachments(trimmed, attachments).catch((error: unknown) => {
      this.notice = { tone: 'error', message: errorMessage(error) }
      if (this.agent === 'running') this.agent = 'idle'
      this.emit()
    })
    this.emit()
  }

  private requestCompact(): void {
    if (this.agent !== 'idle') {
      this.notice = { tone: 'info', message: text(this.locale, 'turnBusy') }
      this.emit()
      return
    }
    this.notice = undefined
    this.interruptArmed = false
    void this.promptWithAttachments('/compact', []).catch((error: unknown) => {
      this.notice = { tone: 'error', message: errorMessage(error) }
      this.emit()
    })
    this.emit()
  }

  private promptWithAttachments(
    text: string,
    attachments: readonly { path: string; token: string }[],
  ): Promise<string> {
    if (attachments.length === 0) {
      return this.runtime.prompt(this.sessionId, [{ type: 'text', text }])
    }
    return loadFileContext({
      cwd: this.cwd,
      paths: attachments.map((attachment) => attachment.path),
    }).then((files) => this.runtime.prompt(this.sessionId, buildPromptBlocks(text, files)))
  }

  private queueCurrentPrompt(): void {
    const trimmed = this.draft.text.trim()
    if (trimmed === '' || this.agent !== 'running') return
    if (this.queuedPrompts.length >= 8) {
      this.notice = { tone: 'info', message: text(this.locale, 'queueFull') }
      this.emit()
      return
    }
    this.queuedPrompts.push({ text: trimmed, attachments: this.attachments.slice() })
    this.history.push(trimmed)
    this.draft = createDraft()
    this.attachments = []
    this.notice = {
      tone: 'info',
      message: text(this.locale, 'queueAdded', {
        count: String(this.queuedPrompts.length),
      }),
    }
    this.emit()
  }

  private flushQueuedPrompt(): void {
    if (this.agent !== 'idle') return
    const next = this.queuedPrompts.shift()
    if (next === undefined) return
    this.agent = 'running'
    this.notice = { tone: 'info', message: text(this.locale, 'queueSending') }
    this.emit()
    void this.promptWithAttachments(next.text, next.attachments).catch((error: unknown) => {
      this.notice = { tone: 'error', message: errorMessage(error) }
      this.agent = 'idle'
      this.emit()
    })
  }

  private pruneAttachments(): void {
    this.attachments = this.attachments.filter((attachment) =>
      this.draft.text.includes(attachment.token),
    )
  }

  private runCommand(line: string): void {
    const parsed = parseSlash(line)
    if (parsed === null) {
      this.notice = errorNotice('COMMAND_INVALID')
      this.emit()
      return
    }
    const command = this.commands.find(parsed.name, this.capabilities)
    if (command === undefined) {
      this.notice = errorNotice('COMMAND_UNKNOWN', { name: parsed.name })
      this.emit()
      return
    }
    this.draft = createDraft()
    this.attachments = []
    this.history.push(line)
    command.run(this.commandCtx(), parsed.args)
  }

  private onNotification(notification: TuiNotification): void {
    handleNotification(notification, {
      sessionId: this.sessionId,
      ingest: (event) => {
        this.telemetry.ingest(event)
        this.sessionState.ingest(event)
        this.assembler.ingest(event)
      },
      isDeadOrExiting: () => this.agent === 'dead' || this.exiting,
      setAgent: (agent) => {
        const previous = this.agent
        this.agent = agent
        if (previous === 'running' && agent === 'idle' && this.queuedPrompts.length === 0) {
          notifyTerminal({
            ...this.terminalNotify,
            title: 'Cocode',
            body: text(this.locale, 'turnComplete'),
          })
        }
        if (agent === 'idle') this.flushQueuedPrompt()
      },
      clearInterrupt: () => {
        this.interruptArmed = false
      },
      subagentStarted: (childSessionId) => {
        this.recordSubagent(childSessionId, 'started')
        return text(this.locale, 'subagentStarted', { id: safeSubagentId(childSessionId) })
      },
      subagentFinished: (childSessionId) => {
        this.recordSubagent(childSessionId, 'finished')
        return text(this.locale, 'subagentFinished', { id: safeSubagentId(childSessionId) })
      },
      notice: (message) => {
        this.notice = { tone: 'info', message }
      },
      emit: () => this.scheduleEmit(),
    })
  }

  private recordSubagent(childSessionId: string, event: 'started' | 'finished'): void {
    const id = safeSubagentId(childSessionId)
    if (id === '') return
    if (event === 'started') this.activeSubagents.add(id)
    else this.activeSubagents.delete(id)
    this.lastSubagent = { id, event }
  }

  private resetSubagentActivity(): void {
    this.activeSubagents.clear()
    this.lastSubagent = undefined
  }

  private resetTelemetry(): void {
    this.telemetry.reset()
  }

  private resetSessionState(): void {
    this.sessionState.reset()
  }

  private switchHost(): ChannelSwitchHost {
    return this as unknown as ChannelSwitchHost
  }

  private beginQuit(): void {
    if (this.exiting) return
    this.exiting = true
    this.emit()
    void this.close().catch(() => undefined)
  }

  private emit(): void {
    for (const listener of this.listeners) listener()
  }

  private scheduleEmit(): void {
    if (this.emitScheduled) return
    this.emitScheduled = true
    queueMicrotask(() => {
      this.emitScheduled = false
      this.emit()
    })
  }
}

function applyRuntimeCapabilities(
  configured: TuiCapabilities,
  runtime: TuiCapabilitySnapshot,
): TuiCapabilities {
  return {
    ...configured,
    cancel: runtime.capabilities.cancel,
    open: runtime.capabilities.open,
    fork: runtime.capabilities.fork,
    rewind: runtime.capabilities.rewind,
    skills: runtime.capabilities.skills,
  }
}

function safeSubagentId(value: string): string {
  return [...value]
    .filter((char) => {
      const code = char.charCodeAt(0)
      return code >= 0x20 && code !== 0x7f
    })
    .join('')
    .slice(0, 32)
}
