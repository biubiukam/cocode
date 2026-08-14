/**
 * Line diff computation for the review surfaces.
 *
 * The wire carries whole before/after texts (`FileDiff`), not hunks, so the client
 * derives the presentation. A plain longest-common-subsequence over lines is
 * enough at review sizes and keeps the result deterministic, which matters because
 * the same diff is rendered in a tool card and in the Preview panel.
 */

export type DiffLineKind = 'context' | 'add' | 'remove'

export type DiffLine = {
  kind: DiffLineKind
  /** 1-based line number in the old file; absent on an added line. */
  oldNumber?: number
  /** 1-based line number in the new file; absent on a removed line. */
  newNumber?: number
  text: string
}

export type DiffHunk = {
  lines: DiffLine[]
}

export type FileDiffView = {
  path: string
  hunks: DiffHunk[]
  additions: number
  deletions: number
}

/** Lines of unchanged context kept around each changed run. */
const CONTEXT_LINES = 3
/** Above this line count the whole-file LCS table stops being worth building. */
const LCS_LINE_BUDGET = 4000

function splitLines(text: string): string[] {
  const lines = text.split('\n')
  // A trailing newline yields an empty final element that is not a real line.
  if (lines.length > 1 && lines.at(-1) === '') lines.pop()
  return lines
}

/** Longest-common-subsequence backtrack producing an ordered edit script. */
function diffLines(oldLines: string[], newLines: string[]): DiffLine[] {
  const rows = oldLines.length
  const columns = newLines.length

  if (rows * columns > LCS_LINE_BUDGET * LCS_LINE_BUDGET) {
    // Degenerate to whole-file replacement rather than allocating a huge table.
    return [
      ...oldLines.map((text, index): DiffLine => ({ kind: 'remove', oldNumber: index + 1, text })),
      ...newLines.map((text, index): DiffLine => ({ kind: 'add', newNumber: index + 1, text })),
    ]
  }

  const table: number[][] = Array.from({ length: rows + 1 }, () => new Array<number>(columns + 1).fill(0))
  for (let row = rows - 1; row >= 0; row -= 1) {
    for (let column = columns - 1; column >= 0; column -= 1) {
      const current = table[row]
      const next = table[row + 1]
      if (current === undefined || next === undefined) continue
      current[column] = oldLines[row] === newLines[column]
        ? (next[column + 1] ?? 0) + 1
        : Math.max(next[column] ?? 0, current[column + 1] ?? 0)
    }
  }

  const result: DiffLine[] = []
  let row = 0
  let column = 0
  while (row < rows && column < columns) {
    const oldLine = oldLines[row] ?? ''
    const newLine = newLines[column] ?? ''
    if (oldLine === newLine) {
      result.push({ kind: 'context', oldNumber: row + 1, newNumber: column + 1, text: oldLine })
      row += 1
      column += 1
      continue
    }
    const down = table[row + 1]?.[column] ?? 0
    const right = table[row]?.[column + 1] ?? 0
    if (down >= right) {
      result.push({ kind: 'remove', oldNumber: row + 1, text: oldLine })
      row += 1
    }
    else {
      result.push({ kind: 'add', newNumber: column + 1, text: newLine })
      column += 1
    }
  }
  while (row < rows) {
    result.push({ kind: 'remove', oldNumber: row + 1, text: oldLines[row] ?? '' })
    row += 1
  }
  while (column < columns) {
    result.push({ kind: 'add', newNumber: column + 1, text: newLines[column] ?? '' })
    column += 1
  }
  return result
}

/** Keeps changed runs plus their surrounding context, dropping untouched stretches. */
function toHunks(lines: DiffLine[]): DiffHunk[] {
  const keep = new Array<boolean>(lines.length).fill(false)
  lines.forEach((line, index) => {
    if (line.kind === 'context') return
    for (let offset = -CONTEXT_LINES; offset <= CONTEXT_LINES; offset += 1) {
      const target = index + offset
      if (target >= 0 && target < lines.length) keep[target] = true
    }
  })

  const hunks: DiffHunk[] = []
  let current: DiffLine[] = []
  lines.forEach((line, index) => {
    if (keep[index] === true) {
      current.push(line)
      return
    }
    if (current.length > 0) {
      hunks.push({ lines: current })
      current = []
    }
  })
  if (current.length > 0) hunks.push({ lines: current })
  return hunks
}

/**
 * Turns a wire `FileDiff` into the renderable review model.
 * @param path - the changed file's display path.
 * @param oldText - prior content, or `null` for a create/overwrite with no before-image.
 * @param newText - content after the change.
 * @returns hunks plus the change counters shown in the toolbar pill.
 */
export function buildFileDiff(path: string, oldText: string | null, newText: string): FileDiffView {
  const oldLines = oldText === null ? [] : splitLines(oldText)
  const newLines = splitLines(newText)
  const lines = diffLines(oldLines, newLines)
  return {
    path,
    hunks: toHunks(lines),
    additions: lines.filter(line => line.kind === 'add').length,
    deletions: lines.filter(line => line.kind === 'remove').length,
  }
}
