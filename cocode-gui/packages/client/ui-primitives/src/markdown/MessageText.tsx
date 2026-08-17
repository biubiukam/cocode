// MessageText is the literal-text primitive for user and steering content; assistant output uses MarkdownText.

import type { ReactNode } from 'react'
import { GitHubRefLink } from './GitHubRefLink.tsx'
import { GITHUB_REF_URL_RE, parseGitHubRef } from './github-ref.ts'
import css from './MessageText.module.css'

function renderPlainText(text: string): ReactNode {
  const parts: ReactNode[] = []
  let cursor = 0
  let match: RegExpExecArray | null
  GITHUB_REF_URL_RE.lastIndex = 0
  while ((match = GITHUB_REF_URL_RE.exec(text)) !== null) {
    const url = match[0]
    const start = match.index
    if (start > cursor) parts.push(text.slice(cursor, start))
    const ghRef = parseGitHubRef(url)
    if (ghRef !== undefined) parts.push(<GitHubRefLink key={start} href={url} ref={ghRef} />)
    else parts.push(url)
    cursor = start + url.length
  }
  if (parts.length === 0) return text
  if (cursor < text.length) parts.push(text.slice(cursor))
  return parts
}

export function MessageText({ text }: { text: string }) {
  return <div className={css.text}>{renderPlainText(text)}</div>
}
