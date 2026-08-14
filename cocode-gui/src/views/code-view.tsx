/**
 * Syntax-highlighted code with optional line numbers.
 * Shared by Preview, tool cards, and the diff view so one grammar set serves all.
 */

import { useEffect, useState } from 'react'
import { cn } from '@cocode/ui'
import { HIGHLIGHT_THEMES, getHighlighter, languageOf } from './highlighter.ts'
import { useThemeMode } from '../shell/theme.tsx'

export type CodeViewProps = {
  code: string
  /** A grammar id, or a path the grammar is derived from. */
  language?: string
  path?: string
  /** 1-based line number of the first rendered line. */
  startLine?: number
  showLineNumbers?: boolean
  className?: string
}

export function CodeView({ code, language, path, startLine = 1, showLineNumbers = false, className }: CodeViewProps) {
  const mode = useThemeMode()
  const [html, setHtml] = useState<string | undefined>(undefined)
  const grammar = language ?? (path === undefined ? 'text' : languageOf(path))

  useEffect(() => {
    let cancelled = false
    void getHighlighter().then(highlighter => {
      if (cancelled) return
      const loaded = highlighter.getLoadedLanguages()
      const safeGrammar = loaded.includes(grammar) ? grammar : 'text'
      setHtml(highlighter.codeToHtml(code, {
        lang: safeGrammar,
        theme: mode === 'dark' ? HIGHLIGHT_THEMES.dark : HIGHLIGHT_THEMES.light,
      }))
    })
    return () => { cancelled = true }
  }, [code, grammar, mode])

  const lineCount = code.split('\n').length

  return (
    <div className={cn('flex min-w-0 overflow-auto rounded-sm bg-surface-sunken font-mono text-[10px] leading-[1.65]', className)}>
      {showLineNumbers
        ? (
            <div aria-hidden className="shrink-0 select-none border-r border-border px-2 py-2 text-right text-subtle-foreground">
              {Array.from({ length: lineCount }, (_, index) => (
                <div key={index}>{startLine + index}</div>
              ))}
            </div>
          )
        : null}
      {html === undefined
        ? <pre className="min-w-0 flex-1 overflow-x-auto px-3 py-2">{code}</pre>
        : (
            <div
              className="min-w-0 flex-1 overflow-x-auto px-3 py-2 [&_pre]:!bg-transparent [&_pre]:m-0"
              // Shiki output is generated from the code we passed in and contains
              // only span elements with inline styles.
              dangerouslySetInnerHTML={{ __html: html }}
            />
          )}
    </div>
  )
}
