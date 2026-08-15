/** A bounded, display-only projection of unified diff text. */

export type DiffLineKind = 'header' | 'hunk' | 'context' | 'add' | 'remove' | 'meta'

export type DiffLine = {
  kind: DiffLineKind
  text: string
  oldLine?: number
  newLine?: number
}

export type DiffFileSummary = {
  path: string
  additions: number
  deletions: number
  binary: boolean
  truncated: boolean
  lines: readonly DiffLine[]
}

export type DiffSummary = {
  files: readonly DiffFileSummary[]
  additions: number
  deletions: number
  truncated: boolean
  binaryFiles: number
}

const DEFAULT_MAX_FILES = 100
const DEFAULT_MAX_LINES = 80

export function parseDiffSummary(
  input: string,
  options: { maxFiles?: number; maxLinesPerFile?: number } = {},
): DiffSummary {
  const normalizedInput = normalize(input)
  if (!/^diff --git /m.test(normalizedInput) && !/^--- .+\n\+\+\+ /m.test(normalizedInput)) {
    return { files: [], additions: 0, deletions: 0, truncated: false, binaryFiles: 0 }
  }
  const maxFiles = Math.max(1, Math.trunc(options.maxFiles ?? DEFAULT_MAX_FILES))
  const maxLines = Math.max(1, Math.trunc(options.maxLinesPerFile ?? DEFAULT_MAX_LINES))
  const files: DiffFileSummary[] = []
  let current: MutableDiffFile | undefined
  let oldLine = 0
  let newLine = 0
  let truncated = false

  const pushCurrent = () => {
    if (current === undefined) return
    files.push({ ...current, lines: [...current.lines] })
    current = undefined
  }
  const ensureCurrent = (path = 'diff') => {
    if (current !== undefined) return current
    if (files.length >= maxFiles) {
      truncated = true
      return undefined
    }
    current = { path, additions: 0, deletions: 0, binary: false, truncated: false, lines: [] }
    return current
  }

  for (const rawLine of normalizedInput.split('\n')) {
    const line = stripControl(rawLine)
    if (line.startsWith('diff --git ')) {
      pushCurrent()
      const match = / b\/(.*)$/.exec(line)
      ensureCurrent(match?.[1] ?? line.slice('diff --git '.length))?.lines.push({
        kind: 'header',
        text: line,
      })
      continue
    }
    if (line.startsWith('Binary files ') || line.includes('GIT binary patch')) {
      const item = ensureCurrent()
      if (item !== undefined) {
        item.binary = true
        addLine(item, { kind: 'meta', text: line }, maxLines)
      }
      continue
    }
    if (line.startsWith('@@')) {
      const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line)
      oldLine = Number(match?.[1] ?? 0)
      newLine = Number(match?.[2] ?? 0)
      const item = ensureCurrent()
      if (item !== undefined) addLine(item, { kind: 'hunk', text: line }, maxLines)
      continue
    }
    const item = ensureCurrent()
    if (item === undefined) continue
    if (line.startsWith('+++ ') || line.startsWith('--- ')) {
      addLine(item, { kind: 'meta', text: line }, maxLines)
      const path = line.slice(4).replace(/^b\//, '').replace(/^a\//, '')
      if (path !== '/dev/null' && path !== 'NUL') item.path = path
      continue
    }
    if (line.startsWith('+') && !line.startsWith('+++')) {
      item.additions += 1
      addLine(item, { kind: 'add', text: line.slice(1), newLine: newLine++ }, maxLines)
      continue
    }
    if (line.startsWith('-') && !line.startsWith('---')) {
      item.deletions += 1
      addLine(item, { kind: 'remove', text: line.slice(1), oldLine: oldLine++ }, maxLines)
      continue
    }
    if (line.startsWith('\\ No newline')) {
      addLine(item, { kind: 'meta', text: line }, maxLines)
      continue
    }
    if (line !== '') {
      addLine(
        item,
        {
          kind: 'context',
          text: line.slice(0, 1) === ' ' ? line.slice(1) : line,
          oldLine: oldLine++,
          newLine: newLine++,
        },
        maxLines,
      )
    }
  }
  pushCurrent()
  const additions = files.reduce((total, file) => total + file.additions, 0)
  const deletions = files.reduce((total, file) => total + file.deletions, 0)
  return {
    files,
    additions,
    deletions,
    truncated: truncated || files.some((file) => file.truncated),
    binaryFiles: files.filter((file) => file.binary).length,
  }
}

export function formatDiffSummary(summary: DiffSummary): string {
  const files = summary.files.map((file) => `${file.path} (+${file.additions}/-${file.deletions})`)
  return `${files.join(', ')} · +${summary.additions}/-${summary.deletions}${
    summary.truncated ? ' · truncated' : ''
  }`
}

type MutableDiffFile = Omit<DiffFileSummary, 'lines'> & { lines: DiffLine[] }

function addLine(file: MutableDiffFile, line: DiffLine, maxLines: number): void {
  if (file.lines.length >= maxLines) {
    file.truncated = true
    return
  }
  file.lines.push(line)
}

function normalize(value: string): string {
  return value.replace(/\r\n?/g, '\n')
}

function stripControl(value: string): string {
  return [...value]
    .filter((char) => {
      const code = char.charCodeAt(0)
      return code === 9 || code >= 0x20
    })
    .join('')
}
