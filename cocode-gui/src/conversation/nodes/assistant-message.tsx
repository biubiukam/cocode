/**
 * One assistant step (design system §5.1).
 *
 * Body width is capped at 58ch. While streaming, the meta line switches to the
 * accent ink with a pulsing dot; a step that has produced nothing yet shows the
 * three-bar thinking placeholder rather than an empty bubble.
 */

import { useState } from 'react'
import { Bot, ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@cocode/ui'
import type { AssistantNode } from '../../runtime/index.ts'
import { MarkdownView } from '../../views/markdown.tsx'

function Thinking() {
  return (
    <div aria-label="正在思考" className="flex flex-col gap-1.5 py-1">
      {['88%', '64%', '38%'].map((width, index) => (
        <span
          key={width}
          className="cocode-pulse block h-2 rounded-lg bg-secondary"
          style={{ width, animationDelay: `${String(index * 120)}ms` }}
        />
      ))}
    </div>
  )
}

export function AssistantMessage({ node }: { node: AssistantNode }) {
  const [reasoningOpen, setReasoningOpen] = useState(false)
  const empty = node.text === '' && node.reasoning === ''

  return (
    <article className="cocode-rise grid grid-cols-[30px_minmax(0,1fr)] gap-3.5 py-3.5">
      <div aria-hidden className="grid size-[30px] place-items-center rounded-full bg-foreground text-background">
        <Bot className="size-3.5" />
      </div>
      <div className="min-w-0">
        <div className={cn('mb-1 flex items-center gap-1.5 text-[11px]', node.streaming ? 'text-accent-ink' : 'text-muted-foreground')}>
          <span className="text-[12px] font-medium text-foreground">Agent</span>
          {node.streaming
            ? (
                <>
                  <span aria-hidden className="cocode-pulse size-1.5 rounded-full bg-accent" />
                  <span>streaming</span>
                </>
              )
            : null}
          {node.usage === undefined
            ? null
            : (
                <span className="font-mono tabular-nums text-subtle-foreground">
                  {node.usage.inputTokens}↑ {node.usage.outputTokens}↓
                </span>
              )}
        </div>

        {node.reasoning === ''
          ? null
          : (
              <details className="mb-2" open={reasoningOpen}>
                <summary
                  onClick={event => {
                    event.preventDefault()
                    setReasoningOpen(open => !open)
                  }}
                  className="flex min-h-[28px] cursor-default list-none items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  {reasoningOpen ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                  思考过程
                </summary>
                {reasoningOpen
                  ? (
                      <p className="mt-1 whitespace-pre-wrap border-l-2 border-border pl-3 font-mono text-[10px] leading-[1.55] text-muted-foreground">
                        {node.reasoning}
                      </p>
                    )
                  : null}
              </details>
            )}

        <div aria-live={node.streaming ? 'polite' : 'off'}>
          {empty && node.streaming ? <Thinking /> : <MarkdownView text={node.text} className="max-w-[58ch]" />}
        </div>
      </div>
    </article>
  )
}
