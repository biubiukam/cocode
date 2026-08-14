/**
 * Agent prose rendering. Body width is capped at 58ch (design system §5.1) by the
 * caller; this component owns only the block styling and code handoff to Shiki.
 */

import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ComponentProps } from 'react'
import { cn } from '@cocode/ui'
import { CodeView } from './code-view.tsx'
import { getDockPrefs } from '../runtime/prefs/dock-prefs.ts'
import { tryOpenBrowserLink } from '../runtime/browser/link-open.ts'

function extractLanguage(className: string | undefined): string | undefined {
  const match = /language-([\w-]+)/.exec(className ?? '')
  return match?.[1]
}

export function MarkdownView({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn('cocode-prose text-[14px] leading-[1.5] text-foreground', className)}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className: codeClassName, children, ...props }: ComponentProps<'code'>) {
            const language = extractLanguage(codeClassName)
            const content = String(children).replace(/\n$/, '')
            // A fenced block always carries a language class; anything else is inline.
            if (language === undefined && !content.includes('\n')) {
              return (
                <code className="rounded-[4px] bg-surface-sunken px-1 py-px font-mono text-[12px]" {...props}>
                  {children}
                </code>
              )
            }
            return <CodeView code={content} language={language} className="my-2" />
          },
          a({ children, href }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="text-accent-ink underline underline-offset-2"
                onClick={event => {
                  if (href === undefined || !getDockPrefs().browserInterceptLinks) return
                  if (tryOpenBrowserLink(href, event)) event.preventDefault()
                }}
              >
                {children}
              </a>
            )
          },
        }}
      >
        {text}
      </Markdown>
    </div>
  )
}
