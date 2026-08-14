/**
 * The ask-user surface.
 *
 * The harness initiates this request, so it is part of the connection state
 * machine rather than an ordinary dialog: it must survive a re-render, and a
 * generation loss clears it because the socket it belonged to is gone (RFC §4.3).
 */

import { useState } from 'react'
import { HelpCircle } from 'lucide-react'
import { Button, Input, cn } from '@cocode/ui'
import type { AskUserQuestionItem } from '@cocode/gui-connection'
import type { QuestionAnswer } from '../runtime/index.ts'

export type QuestionCardProps = {
  questions: readonly AskUserQuestionItem[]
  onAnswer(answers: QuestionAnswer[]): void
  onCancel(): void
}

const OTHER = '__other__'

export function QuestionCard({ questions, onAnswer, onCancel }: QuestionCardProps) {
  const [selection, setSelection] = useState<Record<string, string[]>>({})
  const [custom, setCustom] = useState<Record<string, string>>({})

  const toggle = (question: AskUserQuestionItem, optionId: string) => {
    setSelection(state => {
      const current = state[question.id] ?? []
      if (question.allow_multiple === true) {
        return {
          ...state,
          [question.id]: current.includes(optionId) ? current.filter(id => id !== optionId) : [...current, optionId],
        }
      }
      return { ...state, [question.id]: [optionId] }
    })
  }

  const answered = questions.every(question => (selection[question.id] ?? []).length > 0)

  const submit = () => {
    onAnswer(questions.map(question => {
      const selected = selection[question.id] ?? []
      const text = custom[question.id]
      return {
        id: question.id,
        selected: selected.filter(id => id !== OTHER),
        ...(selected.includes(OTHER) && text !== undefined && text !== '' ? { custom: text } : {}),
      }
    }))
  }

  return (
    <section
      aria-label="Agent 的提问"
      className="my-3 ml-[44px] rounded-md border border-[color-mix(in_srgb,var(--accent)_24%,var(--border))] bg-accent-soft p-3"
    >
      <div className="mb-2 flex items-center gap-2">
        <HelpCircle className="size-4 text-accent-ink" />
        <p className="text-[12px] font-semibold text-foreground">Agent 需要你做一个选择</p>
      </div>

      <div className="flex flex-col gap-3">
        {questions.map(question => {
          const selected = selection[question.id] ?? []
          return (
            <fieldset key={question.id} className="min-w-0">
              <legend className="mb-1.5 text-[12px] text-foreground">{question.prompt}</legend>
              <div className="flex flex-wrap gap-1.5">
                {[...question.options, { id: OTHER, label: '其他…' }].map(option => (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={selected.includes(option.id)}
                    onClick={() => toggle(question, option.id)}
                    className={cn(
                      'min-h-[28px] rounded-sm border px-2.5 text-[11px] transition-colors duration-150',
                      selected.includes(option.id)
                        ? 'border-[color-mix(in_srgb,var(--accent)_36%,var(--border))] bg-background font-semibold text-accent-ink'
                        : 'border-border bg-background text-secondary-foreground hover:bg-secondary',
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              {selected.includes(OTHER)
                ? (
                    <Input
                      className="mt-1.5 h-8 text-[12px]"
                      placeholder="补充说明"
                      aria-label={`${question.prompt} 的自定义回答`}
                      value={custom[question.id] ?? ''}
                      onChange={event => setCustom(state => ({ ...state, [question.id]: event.target.value }))}
                    />
                  )
                : null}
            </fieldset>
          )
        })}
      </div>

      <div className="mt-3 flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel}>取消</Button>
        <Button size="sm" variant="primary" disabled={!answered} onClick={submit}>提交</Button>
      </div>
    </section>
  )
}
