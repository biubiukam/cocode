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
  | 'agentThinking'
  | 'agentStarting'
  | 'agentDead'
  | 'emptyTitle'
  | 'emptyHint'
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
  | 'resumeNoSummary'
  | 'resumeLoading'
  | 'resumeLoaded'
  | 'resumeUnavailable'
  | 'skillsTitle'
  | 'skillsHint'
  | 'skillsQuery'
  | 'skillsEmpty'
  | 'skillsUnavailable'
  | 'skillReady'
  | 'questionTitle'
  | 'questionHint'
  | 'questionCustom'
  | 'questionMultiHint'
  | 'questionSelectHint'
  | 'rewindTitle'
  | 'rewindHint'
  | 'rewindArm'
  | 'rewindEmpty'
  | 'rewindLoading'
  | 'rewindLoaded'
  | 'forkLoading'
  | 'rewindConfirm'
  | 'rewindUnavailable'
  | 'subagentsRunning'
  | 'subagentStarted'
  | 'subagentFinished'
  | 'queueCount'
  | 'queueAdded'
  | 'queueFull'
  | 'queueSending'
  | 'queueTitle'
  | 'queueHint'
  | 'queueQuery'
  | 'queueEmpty'
  | 'queueAttachments'
  | 'queueDeleted'
  | 'queueRestored'
  | 'turnComplete'
  | 'turnBusy'
  | 'cancelRequested'
  | 'cancelNotRunning'
  | 'cancelFailed'
  | 'telemetryTps'
  | 'telemetryCache'
  | 'telemetryContext'
  | 'telemetryReasoning'
  | 'telemetryActivity'
  | 'telemetrySegments'
  | 'todoProgress'
  | 'goalPhase'
  | 'agentPreset'
  | 'transcriptTrimmed'
  | 'editorOpening'
  | 'editorUnavailable'
  | 'terminalTooSmall'
  | 'terminalResize'
  | 'inspector'
  | 'inspectorActivity'
  | 'inspectorContext'
  | 'inspectorFiles'
  | 'inspectorSession'
  | 'inspectorEmpty'
  | 'inspectorGoal'
  | 'inspectorTodos'
  | 'copySuccess'
  | 'copyEmpty'
  | 'copyUnavailable'
  | 'focusStatusOn'
  | 'focusEnabled'
  | 'focusDisabled'
  | 'reviewTitle'
  | 'reviewHint'
  | 'reviewLoading'
  | 'reviewPreview'
  | 'reviewScopeWorkingTree'
  | 'reviewScopeStaged'
  | 'reviewScopeLastCommit'
  | 'reviewScopeBranch'
  | 'reviewConfirm'
  | 'reviewEmpty'
  | 'reviewFailed'
  | 'reviewSending'
  | 'reviewUsage'
  | 'reviewBinary'
  | 'reviewUntracked'
  | 'reviewTruncated'
  | 'reviewDiffFolded'
  | 'reviewFilesFolded'
  | 'reviewTextFolded'
  | 'reviewSummary'
  | 'reviewOmittedFiles'
  | 'approvalTitle'
  | 'approvalHint'
  | 'approvalAllowed'
  | 'approvalAllowedForTurn'
  | 'approvalRejected'
  | 'approvalUnavailable'
  | 'approvalTimedOut'
  | 'approvalTarget'
  | 'approvalRisk'
  | 'approvalSource'
  | 'approvalUnavailableValue'
  | 'permissionUnavailable'
  | 'permissionChanged'
  | 'planUnavailable'
  | 'planEnabled'
  | 'planDisabled'
  | 'steerSending'
  | 'forkUnavailable'
  | 'forkCreated'
  | 'forkTitle'
  | 'forkHint'
  | 'forkConfirm'
  | 'forkEmpty'
  | 'sessionTreeUnavailable'
  | 'sessionTreeEmpty'
  | 'sessionTreeTitle'
  | 'sessionTreeHint'
  | 'sessionTreeQuery'
  | 'sessionTreeLoading'
  | 'sessionTreeOpenFailed'

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
    messageModeHint: '↑↓ move · enter expand · c copy · esc close',
    footerHistory: '↑↓ history',
    footerMessages: 'shift+↑ messages',
    footerDetails: 'ctrl+o details',
    footerHelp: '? help',
    footerQuit: 'esc interrupt / quit',
    footerRedraw: 'ctrl+l redraw',
    agentIdle: 'idle',
    agentRunning: 'running',
    agentThinking: 'thinking…',
    agentStarting: 'starting',
    agentDead: 'dead',
    emptyTitle: 'cocode is ready',
    emptyHint: 'Ask a question or describe a task to start.',
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
    resumeNoSummary: 'No summary',
    resumeLoading: 'Loading session history…',
    resumeLoaded: 'Resumed session {session}.',
    resumeUnavailable: 'Cannot resume session {session}: the session file is unavailable.',
    skillsTitle: 'Workspace skills',
    skillsHint: 'type to filter · ↑↓ select · enter use · esc close',
    skillsQuery: 'filter: {query}',
    skillsEmpty: 'No user-invocable skills found.',
    skillsUnavailable: 'Skills are unavailable in this runtime.',
    skillReady: 'Skill /{name} is ready in the composer.',
    questionTitle: 'Question',
    questionHint: '↑↓ move · enter answer · esc cancel',
    questionCustom: 'Type another answer',
    questionMultiHint: 'space toggles options · tab opens custom answer',
    questionSelectHint: 'enter selects · tab opens custom answer',
    rewindTitle: 'Rewind conversation',
    rewindHint: '↑↓ select · enter review · esc close',
    rewindArm: 'Press Esc again to choose a rewind point.',
    rewindEmpty: 'No user messages available to rewind.',
    rewindLoading: 'Creating a rewind session…',
    rewindLoaded: 'Rewind ready. Edit the draft and press enter to resend.',
    forkLoading: 'Creating a child session…',
    rewindConfirm: 'Rewind to this message? Press enter again to confirm · esc cancel',
    rewindUnavailable: 'Rewind is unavailable.',
    subagentsRunning: '{count} subagents running',
    subagentStarted: 'subagent {id} started',
    subagentFinished: 'subagent {id} finished',
    queueCount: 'queued {count}',
    queueAdded: 'Queued prompt ({count}); it will send when the current turn finishes.',
    queueFull: 'Prompt queue is full (8).',
    queueSending: 'Sending queued prompt…',
    queueTitle: 'Prompt queue',
    queueHint: 'type to filter · ↑↓ select · enter prioritize/retry · ctrl+d remove · esc close',
    queueQuery: 'filter: {query}',
    queueEmpty: 'No queued prompts.',
    queueAttachments: '{count} attachments',
    queueDeleted: 'Queued prompt deleted.',
    queueRestored: 'Queued prompt restored to the front of the queue.',
    turnComplete: 'Turn complete',
    turnBusy: 'Turn in progress. Press Tab to queue this prompt.',
    cancelRequested: 'Cancel requested; waiting for the runtime to become idle.',
    cancelNotRunning: 'No active turn to cancel.',
    cancelFailed: 'Cancel request failed',
    telemetryTps: 'TPS {value}',
    telemetryCache: 'cache {value}%',
    telemetryContext: 'context {value}%',
    telemetryReasoning: 'reasoning {value}',
    telemetryActivity: '{phase}: {line}',
    telemetrySegments: 'segments S{system} P{prompt} A{assistant} T{thinking} X{tools}',
    todoProgress: 'todos {done}/{total}',
    goalPhase: 'goal {phase}',
    agentPreset: 'preset {name}',
    transcriptTrimmed: 'older nodes hidden {count}',
    editorOpening: 'opening draft in $EDITOR…',
    editorUnavailable: 'external editor unavailable',
    terminalTooSmall: 'terminal is too small',
    terminalResize: 'resize from {current} to at least {required} rows · esc quit',
    inspector: 'inspector',
    inspectorActivity: 'activity',
    inspectorContext: 'context',
    inspectorFiles: 'files',
    inspectorSession: 'session',
    inspectorEmpty: 'no active details',
    inspectorGoal: 'goal',
    inspectorTodos: 'todos',
    copySuccess: 'Copied to clipboard.',
    copyEmpty: 'There is no message text to copy.',
    copyUnavailable: 'Clipboard unavailable on this terminal.',
    focusStatusOn: 'focus: latest turn',
    focusEnabled: 'Focus mode enabled: showing the latest turn.',
    focusDisabled: 'Focus mode disabled: showing the full transcript.',
    reviewTitle: 'Code review',
    reviewHint: '↑↓ select · enter continue · esc close',
    reviewLoading: 'Collecting a read-only Git diff…',
    reviewPreview: 'enter send to Cocode · esc close',
    reviewScopeWorkingTree: 'working tree (staged + unstaged)',
    reviewScopeStaged: 'staged changes',
    reviewScopeLastCommit: 'last commit',
    reviewScopeBranch: 'current branch vs base',
    reviewConfirm: 'Review this diff? Press enter to send · esc cancel',
    reviewEmpty: 'No changes found for this review scope.',
    reviewFailed: 'Review unavailable',
    reviewSending: 'Sending review context…',
    reviewUsage: 'Use /review, /review working-tree, staged, last-commit, or branch [base].',
    reviewBinary: 'binary',
    reviewUntracked: 'untracked',
    reviewTruncated: 'truncated',
    reviewDiffFolded: 'diff lines folded',
    reviewFilesFolded: 'files folded',
    reviewTextFolded: 'diff text folded',
    reviewSummary: '{files} files · +{additions}/-{deletions}{binary}{truncated}',
    reviewOmittedFiles: '… {count} untracked files omitted',
    approvalTitle: 'Approval required',
    approvalHint: 'enter/a allow once · t allow for turn · d/n reject · esc cancel',
    approvalAllowed: 'Tool allowed once.',
    approvalAllowedForTurn: 'Tool allowed for this turn.',
    approvalRejected: 'Tool request rejected.',
    approvalUnavailable: 'Approval is unavailable; the tool request was not allowed.',
    approvalTimedOut: 'Approval timed out; the tool request was cancelled.',
    approvalTarget: 'target',
    approvalRisk: 'risk',
    approvalSource: 'source',
    approvalUnavailableValue: 'unavailable',
    permissionUnavailable: 'Permission modes are unavailable in this runtime.',
    permissionChanged: 'Permission mode: {mode}',
    planUnavailable: 'Plan mode is unavailable in this runtime.',
    planEnabled: 'Plan mode enabled.',
    planDisabled: 'Plan mode disabled.',
    steerSending: 'Sending follow-up at the next tool boundary…',
    forkUnavailable: 'Session fork is unavailable or the turn is still running.',
    forkCreated: 'Created a child session from the current conversation.',
    forkTitle: 'Fork session',
    forkHint: '↑↓ select user message · enter confirm · esc close',
    forkConfirm: 'Fork from this message? Press enter again to confirm · esc cancel',
    forkEmpty: 'No previous user message can be used as a fork boundary.',
    sessionTreeUnavailable: 'Runtime session tree is unavailable.',
    sessionTreeEmpty: 'No runtime sessions found.',
    sessionTreeTitle: 'Sessions',
    sessionTreeHint: 'type to filter · ↑↓ select · enter open · esc close',
    sessionTreeQuery: 'filter: {query}',
    sessionTreeLoading: 'Loading sessions…',
    sessionTreeOpenFailed: 'The runtime could not open this session.',
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
    messageModeHint: '↑↓ 移动 · 回车展开 · c 复制 · Esc 关闭',
    footerHistory: '↑↓ 历史',
    footerMessages: 'Shift+↑ 消息',
    footerDetails: 'Ctrl+O 详情',
    footerHelp: '? 帮助',
    footerQuit: 'Esc 中断 / 退出',
    footerRedraw: 'Ctrl+L 重绘',
    agentIdle: '空闲',
    agentRunning: '运行中',
    agentThinking: '思考中…',
    agentStarting: '连接中',
    agentDead: '已停止',
    emptyTitle: 'cocode 已准备好',
    emptyHint: '输入问题或描述任务，开始工作。',
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
    resumeNoSummary: '无摘要',
    resumeLoading: '正在加载会话历史…',
    resumeLoaded: '已恢复会话 {session}。',
    resumeUnavailable: '无法恢复会话 {session}：会话文件不可用。',
    skillsTitle: '工作区技能',
    skillsHint: '输入过滤 · ↑↓ 选择 · 回车使用 · Esc 关闭',
    skillsQuery: '筛选：{query}',
    skillsEmpty: '当前运行时没有可调用的技能。',
    skillsUnavailable: '当前运行时未配置 Skills。',
    skillReady: '技能 /{name} 已写入输入区。',
    questionTitle: '需要确认',
    questionHint: '↑↓ 移动 · 回车回答 · Esc 取消',
    questionCustom: '输入其他答案',
    questionMultiHint: '空格勾选 · Tab 切换到其他答案',
    questionSelectHint: '回车选择 · Tab 切换到其他答案',
    rewindTitle: '回滚会话',
    rewindHint: '↑↓ 选择 · 回车预览 · Esc 关闭',
    rewindArm: '再次按 Esc 选择回滚位置。',
    rewindEmpty: '没有可回滚的用户消息。',
    rewindLoading: '正在创建回滚会话…',
    rewindLoaded: '已准备回滚草稿，修改后按回车重新发送。',
    forkLoading: '正在创建子会话…',
    rewindConfirm: '确定回滚到这条消息？再次回车确认 · Esc 取消',
    rewindUnavailable: '当前无法回滚。',
    subagentsRunning: '{count} 个子代理运行中',
    subagentStarted: '子代理 {id} 已启动',
    subagentFinished: '子代理 {id} 已完成',
    queueCount: '待处理 {count}',
    queueAdded: '已加入队列（{count} 条），当前任务结束后自动发送。',
    queueFull: '输入队列已满（最多 8 条）。',
    queueSending: '正在发送队列中的输入…',
    queueTitle: '输入队列',
    queueHint: '输入过滤 · ↑↓ 选择 · Enter 置顶/重试 · Ctrl+D 删除 · Esc 关闭',
    queueQuery: '筛选：{query}',
    queueEmpty: '当前没有排队中的输入。',
    queueAttachments: '{count} 个附件',
    queueDeleted: '已删除队列中的输入。',
    queueRestored: '已将队列输入恢复到队首。',
    turnComplete: '本轮任务已完成',
    turnBusy: '当前任务仍在运行，按 Tab 可将输入加入队列。',
    cancelRequested: '已请求取消，等待运行时进入空闲状态。',
    cancelNotRunning: '当前没有可取消的任务。',
    cancelFailed: '取消请求失败',
    telemetryTps: 'TPS {value}',
    telemetryCache: '缓存命中 {value}%',
    telemetryContext: '上下文 {value}%',
    telemetryReasoning: '推理 {value}',
    telemetryActivity: '{phase}：{line}',
    telemetrySegments: '分段 系统{system} 输入{prompt} 回复{assistant} 思考{thinking} 工具{tools}',
    todoProgress: '待办 {done}/{total}',
    goalPhase: '目标 {phase}',
    agentPreset: '预设 {name}',
    transcriptTrimmed: '已隐藏较早节点 {count} 个',
    editorOpening: '正在 $EDITOR 中编辑草稿…',
    editorUnavailable: '外部编辑器不可用',
    terminalTooSmall: '终端高度不足',
    terminalResize: '当前 {current} 行，至少需要 {required} 行 · Esc 退出',
    inspector: '详情',
    inspectorActivity: '活动',
    inspectorContext: '上下文',
    inspectorFiles: '文件',
    inspectorSession: '会话',
    inspectorEmpty: '暂无活动详情',
    inspectorGoal: '目标',
    inspectorTodos: '待办',
    copySuccess: '已复制到剪贴板。',
    copyEmpty: '没有可复制的消息文本。',
    copyUnavailable: '当前终端无法使用剪贴板。',
    focusStatusOn: '聚焦：最近一轮',
    focusEnabled: '已开启聚焦模式：仅显示最近一轮。',
    focusDisabled: '已关闭聚焦模式：显示完整会话。',
    reviewTitle: '代码 Review',
    reviewHint: '↑↓ 选择 · 回车继续 · Esc 关闭',
    reviewLoading: '正在读取只读 Git Diff…',
    reviewPreview: '回车发送给 Cocode · Esc 关闭',
    reviewScopeWorkingTree: '工作树（已暂存 + 未暂存）',
    reviewScopeStaged: '已暂存改动',
    reviewScopeLastCommit: '最近一次提交',
    reviewScopeBranch: '当前分支相对基线',
    reviewConfirm: '确认 Review 这份 Diff？回车发送 · Esc 取消',
    reviewEmpty: '当前 Review 范围没有改动。',
    reviewFailed: 'Review 不可用',
    reviewSending: '正在发送 Review 上下文…',
    reviewUsage: '使用 /review、/review working-tree、staged、last-commit 或 branch [base]。',
    reviewBinary: '二进制',
    reviewUntracked: '未跟踪',
    reviewTruncated: '已截断',
    reviewDiffFolded: 'Diff 行已折叠',
    reviewFilesFolded: '个文件已折叠',
    reviewTextFolded: 'Diff 文本已折叠',
    reviewSummary: '{files} 个文件 · +{additions}/-{deletions}{binary}{truncated}',
    reviewOmittedFiles: '… {count} 个未跟踪文件未展示',
    approvalTitle: '需要审批',
    approvalHint: '回车/a 允许一次 · t 允许本轮 · d/n 拒绝 · Esc 取消',
    approvalAllowed: '已允许本次工具调用。',
    approvalAllowedForTurn: '已允许本轮中的工具调用。',
    approvalRejected: '已拒绝工具调用。',
    approvalUnavailable: '审批不可用，工具调用未获允许。',
    approvalTimedOut: '审批超时，工具调用已取消。',
    approvalTarget: '目标',
    approvalRisk: '风险',
    approvalSource: '来源',
    approvalUnavailableValue: '不可用',
    permissionUnavailable: '当前运行时不支持权限模式。',
    permissionChanged: '权限模式：{mode}',
    planUnavailable: '当前运行时不支持计划模式。',
    planEnabled: '已启用计划模式。',
    planDisabled: '已关闭计划模式。',
    steerSending: '将在下一个工具步骤完成后发送后续输入……',
    forkUnavailable: '当前无法创建会话分支，或任务仍在运行。',
    forkCreated: '已从当前对话创建子会话。',
    forkTitle: '创建子会话',
    forkHint: '↑↓ 选择用户消息 · 回车确认 · Esc 关闭',
    forkConfirm: '从这条消息创建分支？再次回车确认 · Esc 取消',
    forkEmpty: '没有可用于创建分支边界的历史用户消息。',
    sessionTreeUnavailable: '当前运行时不支持会话树。',
    sessionTreeEmpty: '没有找到运行时会话。',
    sessionTreeTitle: '会话列表',
    sessionTreeHint: '输入过滤 · ↑↓ 选择 · 回车打开 · Esc 关闭',
    sessionTreeQuery: '筛选：{query}',
    sessionTreeLoading: '正在加载会话列表……',
    sessionTreeOpenFailed: '运行时无法打开该会话。',
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
