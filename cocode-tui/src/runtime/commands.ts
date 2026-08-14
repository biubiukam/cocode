/**
 * Local slash table. Missing wire capabilities stay off the menu.
 */

import type { TuiCapabilities } from './capabilities.ts'
import type { TuiCommandCtx } from './app.ts'
import type { UiLocale } from './ui-locale.ts'

export type Command = {
  name: string
  summary: string
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
    ctx.setModel?.(args)
  })
  local('export', 'Export the projected session as Markdown', (ctx) => {
    void ctx.exportTranscript?.()
  })
  local('init', 'Create AGENTS.md when the workspace has none', (ctx) => {
    void ctx.initWorkspace?.()
  })
  registry.register({
    name: 'resume',
    summary: 'List local session history for this workspace',
    kind: 'local',
    available: (caps) => caps.sessionList === 'jsonl',
    run: (ctx) => {
      void ctx.resumeSessions?.()
    },
  })
  local('new', 'Start a new session id (not a fork)', (ctx) => {
    ctx.newSession()
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
): string {
  const commands = registry
    .list(caps)
    .map((command) => `/${command.name}  ${command.summary}`)
    .join('\n')
  return [
    locale === 'zh' ? 'Cocode TUI（终端界面）' : 'Cocode TUI',
    locale === 'zh'
      ? '回车发送 · Esc/Ctrl+C 中断或退出 · ? 帮助'
      : 'enter send · esc/ctrl+c interrupt-or-quit · ? help',
    locale === 'zh'
      ? 'Ctrl+O 详情 · ↑↓ 历史 · Ctrl+R 搜索 · Shift+↑ 消息选择'
      : 'ctrl+o verbose · up/down history · ctrl+r search · shift+up messages',
    '',
    locale === 'zh'
      ? '本地命令（不是 GUI 命令注册表）：'
      : 'Local commands (not the GUI command registry):',
    commands,
  ].join('\n')
}
