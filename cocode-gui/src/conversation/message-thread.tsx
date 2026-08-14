/**
 * The thread: the shell's one main scroll region.
 *
 * Nodes render through the keyed `conversation.chat.node` slot. The question
 * card hangs on `conversation.composer`.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowDown } from 'lucide-react'
import { Button, Spinner, cn } from '@cocode/ui'
import type { AskUserQuestionItem } from '@cocode/gui-connection'
import type { ConversationNode, QuestionAnswer } from '../runtime/index.ts'
import { SlotOutlet } from '../boot/slot-renderer.tsx'
import { ConversationWelcome } from './conversation-welcome.tsx'

export type MessageThreadProps = {
  nodes: readonly ConversationNode[]
  hasMoreHistory: boolean
  historyLoading: boolean
  question: { rpcId: string; questions: AskUserQuestionItem[] } | undefined
  onLoadOlder(): void
  onApprove(approvalId: string): void
  onReject(approvalId: string): void
  onAnswer(answers: QuestionAnswer[]): void
  onCancelQuestion(): void
  onSuggestionSelect(text: string): void
}

/** Distance from the bottom still treated as "the user is following the stream". */
const STICKY_THRESHOLD_PX = 120

export function MessageThread({
  nodes, hasMoreHistory, historyLoading, question,
  onLoadOlder, onApprove, onReject, onAnswer, onCancelQuestion, onSuggestionSelect,
}: MessageThreadProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [pinned, setPinned] = useState(true)

  const visible = nodes.filter(node => node.kind !== 'user' || !node.synthetic)
  const showWelcome = visible.length === 0 && question === undefined

  useLayoutEffect(() => {
    if (!pinned) return
    const element = scrollRef.current
    if (element === null) return
    element.scrollTop = element.scrollHeight
  }, [visible, question, pinned])

  useEffect(() => {
    const element = scrollRef.current
    if (element === null) return
    const onScroll = () => {
      const distance = element.scrollHeight - element.scrollTop - element.clientHeight
      setPinned(distance <= STICKY_THRESHOLD_PX)
    }
    element.addEventListener('scroll', onScroll, { passive: true })
    return () => element.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={scrollRef} className="h-full overflow-y-auto">
        <div className={cn('mx-auto w-[min(100%,860px)] px-6 pb-6', showWelcome && 'flex min-h-full flex-col')}>
          {hasMoreHistory
            ? (
                <div className="flex justify-center py-3">
                  <Button size="sm" variant="ghost" disabled={historyLoading} onClick={onLoadOlder}>
                    {historyLoading ? <Spinner className="size-3.5" /> : null}
                    加载更早的消息
                  </Button>
                </div>
              )
            : null}

          {showWelcome
            ? (
                <div className="flex w-full flex-1 items-center justify-center py-12">
                  <ConversationWelcome onSuggestionSelect={onSuggestionSelect} />
                </div>
              )
            : null}

          {visible.map(node => (
            <SlotOutlet
              key={node.id}
              name="conversation.chat.node"
              owner={{
                entryKey: node.kind,
                node,
                onApprove,
                onReject,
                onAnswer,
                onCancelQuestion,
              }}
            />
          ))}

          <SlotOutlet
            name="conversation.composer"
            owner={{ question, onAnswer, onCancelQuestion }}
          />
        </div>
      </div>

      {pinned
        ? null
        : (
            <Button
              size="sm"
              variant="secondary"
              className="absolute bottom-3 left-1/2 -translate-x-1/2 shadow-md"
              onClick={() => setPinned(true)}
            >
              <ArrowDown />
              回到最新
            </Button>
          )}
    </div>
  )
}
