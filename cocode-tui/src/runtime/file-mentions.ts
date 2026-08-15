/** Find and replace the file mention around the current composer cursor. */

export type FileMention = {
  start: number
  end: number
  query: string
}

export function findFileMentionAtCursor(text: string, cursor: number): FileMention | undefined {
  const safeCursor = Math.max(0, Math.min(Math.trunc(cursor), text.length))
  const at = text.lastIndexOf('@', safeCursor - 1)
  if (at < 0 || (at > 0 && !/\s/.test(text[at - 1] ?? ''))) return undefined

  const fragment = text.slice(at + 1, safeCursor)
  if (fragment.includes('\n')) return undefined

  if (fragment.startsWith('"')) {
    const closing = text.indexOf('"', at + 2)
    if (closing >= 0 && safeCursor > closing) return undefined
    return {
      start: at,
      end: closing >= 0 ? closing + 1 : text.length,
      query: fragment.slice(1),
    }
  }

  if (/\s/.test(fragment)) return undefined

  let end = at + 1
  while (end < text.length && !/\s/.test(text[end] ?? '')) end += 1
  return { start: at, end, query: fragment }
}

export function formatFileMention(path: string): string {
  if (/^[\w./:@+~-]+$/u.test(path)) return `@${path}`
  return `@"${path.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
}
