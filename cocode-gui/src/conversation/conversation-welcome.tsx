/**
 * Empty-thread welcome: invitation and starter prompts, not the §4.5 empty-state
 * pattern (that belongs to missing panels and disconnected regions).
 */

const SUGGESTIONS = [
  {
    label: '解释这个代码库',
    text: '解释这个代码库的结构和主要模块，用简洁的中文概述',
  },
  {
    label: '修复一个问题',
    text: '帮我定位并修复当前代码库中的一个 bug',
  },
  {
    label: '补充测试',
    text: '为这个项目补充单元测试，优先覆盖核心逻辑',
  },
  {
    label: '提出改进',
    text: '审查代码库，提出 3 个高价值、范围清晰的改进方向',
  },
] as const

export type ConversationWelcomeProps = {
  onSuggestionSelect(text: string): void
}

export function ConversationWelcome({ onSuggestionSelect }: ConversationWelcomeProps) {
  return (
    <div className="conversation-welcome">
      <div className="conversation-welcome-copy">
        <h2 className="conversation-welcome-title">今天我们共同创造什么？</h2>
        <p className="conversation-welcome-desc">
          用一句话说清楚目标就行，Cocode 会读代码、改文件、跑命令
        </p>
      </div>

      <div className="conversation-welcome-suggestions" role="list" aria-label="起手式建议">
        {SUGGESTIONS.map(suggestion => (
          <button
            key={suggestion.label}
            type="button"
            role="listitem"
            className="suggestion-chip"
            onClick={() => onSuggestionSelect(suggestion.text)}
          >
            {suggestion.label}
          </button>
        ))}
      </div>

      <p className="conversation-welcome-hints">
        <kbd>/</kbd>
        {' '}
        唤出命令 · Enter 发送 · ⌘Enter 引导
      </p>
    </div>
  )
}
