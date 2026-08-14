import { resolveLocale } from './errors/locale.ts'

export type UiLocale = 'zh' | 'en'

type UiKey =
  | 'session'
  | 'interactive'
  | 'tokensIn'
  | 'tokensOut'
  | 'secret'
  | 'prompt'
  | 'locked'
  | 'send'
  | 'attached'
  | 'history'
  | 'historyHint'
  | 'historyPlaceholder'
  | 'historyEmpty'
  | 'files'
  | 'filesHint'
  | 'filesSearching'
  | 'commands'
  | 'commandsHint'
  | 'help'
  | 'helpHint'
  | 'messageMode'
  | 'messageModeHint'
  | 'footerHistory'
  | 'footerMessages'
  | 'footerDetails'
  | 'footerHelp'
  | 'footerQuit'
  | 'footerRedraw'
  | 'agentIdle'
  | 'agentRunning'
  | 'agentStarting'
  | 'agentDead'
  | 'langChanged'
  | 'langUsage'
  | 'modelUsage'
  | 'modelBusy'
  | 'modelSwitching'
  | 'modelChanged'
  | 'modelRestored'
  | 'resumeTitle'
  | 'resumeHint'
  | 'resumeQuery'
  | 'resumeEmpty'
  | 'resumeUnavailable'
  | 'subagentsRunning'
  | 'subagentStarted'
  | 'subagentFinished'
  | 'queueCount'
  | 'queueAdded'
  | 'queueFull'
  | 'queueSending'
  | 'turnBusy'

const TEXT: Record<UiLocale, Record<UiKey, string>> = {
  en: {
    session: 'session',
    interactive: 'interactive',
    tokensIn: 'tokens in',
    tokensOut: 'out',
    secret: 'secret',
    prompt: 'prompt',
    locked: 'locked',
    send: 'enter to send',
    attached: 'attached',
    history: 'history',
    historyHint: 'ctrl+r · ↑↓ select · enter use · esc close',
    historyPlaceholder: 'type to search…',
    historyEmpty: 'No matching messages',
    files: 'files',
    filesHint: 'tab / ↑↓ select',
    filesSearching: ' searching workspace…',
    commands: 'commands',
    commandsHint: 'tab / ↑↓ select',
    help: 'help',
    helpHint: 'esc close',
    messageMode: 'message mode',
    messageModeHint: '↑↓ move · enter expand · esc close',
    footerHistory: '↑↓ history',
    footerMessages: 'shift+↑ messages',
    footerDetails: 'ctrl+o details',
    footerHelp: '? help',
    footerQuit: 'esc quit',
    footerRedraw: 'ctrl+l redraw',
    agentIdle: 'idle',
    agentRunning: 'running',
    agentStarting: 'starting',
    agentDead: 'dead',
    langChanged: 'Language: {lang}',
    langUsage: 'Use /lang zh or /lang en.',
    modelUsage: 'Use /model <model-id>.',
    modelBusy: 'Turn in progress. Wait before changing model.',
    modelSwitching: 'Switching model to {model}…',
    modelChanged: 'Model changed to {model}; new session started.',
    modelRestored: 'Model switch failed; restored {model}.',
    resumeTitle: 'Recent sessions',
    resumeHint: 'type to filter · ↑↓ select · enter choose · esc close',
    resumeQuery: 'filter: {query}',
    resumeEmpty: 'No sessions found for this workspace.',
    resumeUnavailable:
      'Cannot resume {session}: the current harness connection has no session/open or session/resume method.',
    subagentsRunning: '{count} subagents running',
    subagentStarted: 'subagent {id} started',
    subagentFinished: 'subagent {id} finished',
    queueCount: 'queued {count}',
    queueAdded: 'Queued prompt ({count}); it will send when the current turn finishes.',
    queueFull: 'Prompt queue is full (8).',
    queueSending: 'Sending queued prompt…',
    turnBusy: 'Turn in progress. Press Tab to queue this prompt.',
  },
  zh: {
    session: '会话',
    interactive: '交互模式',
    tokensIn: '输入 token',
    tokensOut: '输出',
    secret: '密钥',
    prompt: '输入',
    locked: '已锁定',
    send: '回车发送',
    attached: '已附加',
    history: '历史搜索',
    historyHint: 'Ctrl+R · ↑↓ 选择 · 回车使用 · Esc 关闭',
    historyPlaceholder: '输入关键词搜索…',
    historyEmpty: '没有匹配的消息',
    files: '文件',
    filesHint: 'Tab / ↑↓ 选择',
    filesSearching: ' 正在搜索工作区…',
    commands: '命令',
    commandsHint: 'Tab / ↑↓ 选择',
    help: '帮助',
    helpHint: 'Esc 关闭',
    messageMode: '消息模式',
    messageModeHint: '↑↓ 移动 · 回车展开 · Esc 关闭',
    footerHistory: '↑↓ 历史',
    footerMessages: 'Shift+↑ 消息',
    footerDetails: 'Ctrl+O 详情',
    footerHelp: '? 帮助',
    footerQuit: 'Esc 退出',
    footerRedraw: 'Ctrl+L 重绘',
    agentIdle: '空闲',
    agentRunning: '运行中',
    agentStarting: '连接中',
    agentDead: '已停止',
    langChanged: '界面语言：{lang}',
    langUsage: '使用 /lang zh 或 /lang en。',
    modelUsage: '使用 /model <model-id>。',
    modelBusy: '当前任务仍在运行，请等待任务结束后再切换模型。',
    modelSwitching: '正在切换模型到 {model}…',
    modelChanged: '已切换到 {model}，并创建新会话。',
    modelRestored: '模型切换失败，已恢复为 {model}。',
    resumeTitle: '最近会话',
    resumeHint: '输入关键词过滤 · ↑↓ 选择 · 回车确认 · Esc 关闭',
    resumeQuery: '筛选：{query}',
    resumeEmpty: '当前工作区没有可用的历史会话。',
    resumeUnavailable:
      '无法恢复会话 {session}：当前 harness 连接没有 session/open 或 session/resume 方法。',
    subagentsRunning: '{count} 个子代理运行中',
    subagentStarted: '子代理 {id} 已启动',
    subagentFinished: '子代理 {id} 已完成',
    queueCount: '待处理 {count}',
    queueAdded: '已加入队列（{count} 条），当前任务结束后自动发送。',
    queueFull: '输入队列已满（最多 8 条）。',
    queueSending: '正在发送队列中的输入…',
    turnBusy: '当前任务仍在运行，按 Tab 可将输入加入队列。',
  },
}

export function parseUiLocale(value: string | undefined): UiLocale | undefined {
  const language = value?.trim().toLowerCase().split(/[._-]/)[0]
  return language === 'zh' || language === 'en' ? language : undefined
}

export function resolveUiLocale(env: NodeJS.ProcessEnv = process.env): UiLocale {
  return resolveLocale(env)
}

export function text(locale: UiLocale, key: UiKey, params?: Record<string, string>): string {
  let value = TEXT[locale][key]
  for (const [name, replacement] of Object.entries(params ?? {})) {
    value = value.replaceAll(`{${name}}`, replacement)
  }
  return value
}

export function localeName(locale: UiLocale): string {
  return locale === 'zh' ? '中文' : 'English'
}
