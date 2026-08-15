/**
 * Local slash table. Missing wire capabilities stay off the menu.
 */

import type { TuiCapabilities } from './capabilities.ts'
import type { TuiCommandCtx } from './app.ts'
import type { UiLocale } from './ui-locale.ts'

export type Command = {
  name: string
  summary: string
  summaryZh?: string
  kind: 'local' | 'prompt-text'
  available: (caps: TuiCapabilities) => boolean
  run: (app: TuiCommandCtx, args: string) => void
}

export class CommandRegistry {
  private readonly commands: Command[] = []

  register(command: Command): void {
    this.commands.push(command)
  }

  list(caps: TuiCapabilities): Command[] {
    return this.commands.filter((command) => command.available(caps))
  }

  find(name: string, caps: TuiCapabilities): Command | undefined {
    const needle = name.replace(/^\//, '').toLowerCase()
    return this.list(caps).find((command) => command.name === needle)
  }
}

export function filterCommands(commands: readonly Command[], draft: string): readonly Command[] {
  if (!/^\/\S*$/.test(draft)) return []
  const prefix = draft.slice(1).toLowerCase()
  return commands.filter((command) => command.name.toLowerCase().startsWith(prefix))
}

export function createBuiltinCommands(): CommandRegistry {
  const registry = new CommandRegistry()
  const local = (name: string, summary: string, run: Command['run']): void => {
    registry.register({
      name,
      summary,
      kind: 'local',
      available: () => true,
      run,
    })
  }

  local('help', 'Show keyboard and command help', (ctx) => {
    ctx.dispatch({ type: 'toggleHelp' })
  })
  local('exit', 'Shut down the runtime and leave', (ctx) => {
    ctx.dispatch({ type: 'quit' })
  })
  local('clear', 'Clear the projected transcript', (ctx) => {
    ctx.clearTranscript()
  })
  local('redraw', 'Redraw the terminal without clearing the session', (ctx) => {
    ctx.dispatch({ type: 'redraw' })
  })
  local('status', 'Show session, model, and agent state', (ctx) => {
    ctx.showStatus()
  })
  local('doctor', 'Show safe launch and initialize diagnostics', (ctx) => {
    ctx.showDoctor?.()
  })
  local('theme', 'Switch the terminal theme', (ctx, args) => {
    const name = args.trim().toLowerCase()
    if (name !== 'dark' && name !== 'light') {
      ctx.notice('info', 'Use /theme dark or /theme light.')
      return
    }
    ctx.setTheme?.(name)
  })
  local('lang', 'Switch the interface language', (ctx, args) => {
    const value = args.trim().toLowerCase()
    if (value !== 'zh' && value !== 'en') {
      ctx.setLocale?.(value)
      return
    }
    ctx.setLocale?.(value)
  })
  local('model', 'Switch the active model and start a new session', (ctx, args) => {
    const value = args.trim()
    if (value === '') ctx.showModelPicker?.()
    else ctx.setModel?.(value)
  })
  local('models', 'Browse available models and switch the active model', (ctx, args) => {
    if (args.trim() !== '') {
      ctx.notice('info', 'Use /models without arguments.')
      return
    }
    ctx.showModelPicker?.()
  })
  local('export', 'Export the projected session as Markdown', (ctx) => {
    void ctx.exportTranscript?.()
  })
  local('copy', 'Copy the latest assistant reply to the clipboard', (ctx) => {
    ctx.copyLatestAssistant?.()
  })
  registry.register({
    name: 'paste-image',
    summary: 'Paste an image from the system clipboard',
    summaryZh: '从系统剪贴板粘贴图片',
    kind: 'local',
    available: (caps) => caps.imageAttachments,
    run: (ctx) => ctx.pasteImage?.(),
  })
  registry.register({
    name: 'todos',
    summary: 'Show the current task checklist',
    summaryZh: '查看当前任务清单',
    kind: 'local',
    available: () => true,
    run: (ctx) => ctx.showChecklist?.(),
  })
  registry.register({
    name: 'review',
    summary: 'Review Git changes in the current workspace',
    summaryZh: 'Review 当前工作区的 Git 改动',
    kind: 'local',
    available: () => true,
    run: (ctx, args) => {
      ctx.review?.(args)
    },
  })
  registry.register({
    name: 'focus',
    summary: 'Toggle the latest-turn focus view',
    summaryZh: '切换最近一轮聚焦视图',
    kind: 'local',
    available: () => true,
    run: (ctx) => {
      ctx.toggleFocus?.()
    },
  })
  local('init', 'Create AGENTS.md when the workspace has none', (ctx) => {
    void ctx.initWorkspace?.()
  })
  registry.register({
    name: 'resume',
    summary: 'List local session history for this workspace',
    kind: 'local',
    available: (caps) => caps.sessionList !== 'none' && caps.open,
    run: (ctx) => {
      void ctx.resumeSessions?.()
    },
  })
  local('new', 'Start a new session id (not a fork)', (ctx) => {
    ctx.newSession()
  })
  local('compact', 'Request host compaction through the prompt path', (ctx) => {
    ctx.dispatch({ type: 'compact' })
  })
  local('use', 'Switch between API Key and Cocode', (ctx, args) => {
    const target = args.trim().toLowerCase()
    if (target !== 'byok' && target !== 'cocode') {
      ctx.notice('info', 'Use /use byok or /use cocode.')
      return
    }
    ctx.useAuth?.(target)
  })
  local('login', 'Sign in with Cocode', (ctx) => {
    ctx.useAuth?.('login')
  })
  local('logout', 'Sign out of Cocode Cloud', (ctx) => {
    void ctx.logout()
  })
  registry.register({
    name: 'skills',
    summary: 'Browse workspace skills available for user invocation',
    kind: 'local',
    available: (caps) => caps.skills,
    run: (ctx) => {
      ctx.showSkillsPicker?.()
    },
  })
  registry.register({
    name: 'permissions',
    summary: 'Cycle runtime permission mode',
    summaryZh: '切换运行时权限模式',
    kind: 'local',
    available: (caps) => caps.permissionMode,
    run: (ctx) => ctx.dispatch({ type: 'permission.toggle' }),
  })
  registry.register({
    name: 'plan',
    summary: 'Toggle runtime plan mode',
    summaryZh: '切换计划模式',
    kind: 'local',
    available: (caps) => caps.planMode,
    run: (ctx) => ctx.dispatch({ type: 'plan.toggle' }),
  })
  registry.register({
    name: 'fork',
    summary: 'Create a child session from the current conversation',
    summaryZh: '从当前对话创建子会话',
    kind: 'local',
    available: (caps) => caps.fork,
    run: (ctx) => ctx.showForkPicker?.(),
  })
  registry.register({
    name: 'clone',
    summary: 'Clone the current conversation into a new session',
    summaryZh: '将当前对话复制到新会话',
    kind: 'local',
    available: (caps) => caps.fork,
    run: (ctx) => ctx.cloneSession?.(),
  })
  registry.register({
    name: 'tree',
    summary: 'Show the session tree from runtime metadata',
    summaryZh: '显示运行时会话树',
    kind: 'local',
    available: (caps) => caps.sessionList !== 'none' && caps.open,
    run: (ctx) => {
      void ctx.showSessionTree?.()
    },
  })
  registry.register({
    name: 'sessions',
    summary: 'List sessions from the runtime when supported',
    summaryZh: '列出运行时会话（如果支持）',
    kind: 'local',
    available: (caps) => caps.sessionList === 'rpc' && caps.open,
    run: (ctx) => {
      void ctx.showSessionTree?.()
    },
  })
  registry.register({
    name: 'queue',
    summary: 'Inspect queued prompts',
    summaryZh: '查看待发送输入队列',
    kind: 'local',
    available: () => true,
    run: (ctx) => ctx.showQueuePicker?.(),
  })

  return registry
}

export function parseSlash(line: string): { name: string; args: string } | null {
  const trimmed = line.trim()
  if (!trimmed.startsWith('/')) return null
  const match = /^\/(\S+)(?:\s+([\s\S]*))?$/.exec(trimmed)
  if (match === null) return null
  return { name: match[1] ?? '', args: (match[2] ?? '').trim() }
}

export function helpText(
  caps: TuiCapabilities,
  registry: CommandRegistry,
  locale: UiLocale = 'en',
  additional: readonly Command[] = [],
): string {
  const commands = [...registry.list(caps), ...additional]
    .map((command) => `/${command.name}  ${commandSummary(command, locale)}`)
    .join('\n')
  return [
    locale === 'zh' ? 'Cocode TUI（终端界面）' : 'Cocode TUI',
    locale === 'zh'
      ? '回车发送 · Esc/Ctrl+C 中断或退出 · ? 帮助'
      : 'enter send · esc/ctrl+c interrupt-or-quit · ? help',
    locale === 'zh'
      ? `Ctrl+O 详情 · Ctrl+G 编辑 · ↑↓ 历史 · Ctrl+R 搜索 · ${caps.planMode ? 'Tab Build/Plan · ' : ''}Shift+↑ 消息选择`
      : `ctrl+o verbose · ctrl+g editor · up/down history · ctrl+r search · ${caps.planMode ? 'tab Build/Plan · ' : ''}shift+up messages`,
    '',
    locale === 'zh'
      ? '本地命令（不是 GUI 命令注册表）：'
      : 'Local commands (not the GUI command registry):',
    commands,
  ].join('\n')
}

export function commandSummary(command: Command, locale: UiLocale): string {
  return locale === 'zh' ? command.summaryZh ?? command.summary : command.summary
}
