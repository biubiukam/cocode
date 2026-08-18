/**
 * Draft decoration pure core (chips render from the occurrence
 * table at placeholder offsets; the claim token renders as a mirror-layer
 * highlight, the claim hint as ghost text). Zero React — the skeleton renders
 * the instructions; tests drive this directly.
 */
import type { InputState } from './contract.ts'

/** The claim-token highlight range (always draft-leading while the watch holds). */
export interface TokenRange {
  readonly start: number
  readonly end: number
}

/** One chip render instruction: the placeholder at `offset` draws as `label`. */
export interface ChipRender {
  /** Stable render key (same-labeled chips stay independent). */
  readonly occurrenceId: number
  /** Placeholder offset in the draft (the chip occupies [offset, offset+1)). */
  readonly offset: number
  readonly label: string
  /** Owner-resolution failure styling bit. */
  readonly invalid: boolean
}

/**
 * One plain-text reference range (the plain-text-reference decision;
 * see .agents/notes/implemented/architecture/2026-07-25-web-input-machine-and-slash-pipeline.md):
 * a `/name` or `@name` token
 * whose name is on the trigger's lexicon. Pure derivation — editing the text
 * out of match shape simply drops the range next scan.
 */
export interface TextRefRange {
  readonly start: number
  readonly end: number
  readonly trigger: '/' | '@'
}

/** Decoration product: claim token range + chip instructions + text-ref ranges + the ghost hint. */
export interface DraftDecorations {
  /** Claim token range while claimed/submitting and the prefix watch holds; null otherwise. */
  readonly token: TokenRange | null
  /** Chip render instructions in draft order (occurrence table is offset-sorted). */
  readonly chips: readonly ChipRender[]
  /** Scan-derived plain-text reference ranges (empty without a lexicon). */
  readonly textRefs: readonly TextRefRange[]
  /** Ghost hint shown while the claim's args are blank; null otherwise. */
  readonly hint: string | null
}

/** Slash token: `/name` at line start or after whitespace. */
const SLASH_REF_RE = /(^|\s)\/([\w-]+)/g

/**
 * Scan the draft for plain-text reference tokens against the hot lexicons.
 * Word-boundary discipline: the trigger must sit at the draft
 * start or after whitespace ('x/name' never matches); the name must be an
 * exact lexicon member. `@` mentions accept file paths (`@src/a.ts`,
 * `@"my file.ts"`) as well as bare names.
 * @param draft - draft text.
 * @param lexicon - per-trigger name lists (a missing trigger scans nothing).
 * @returns matched ranges in draft order.
 */
export function scanTextRefs(
  draft: string, lexicon: ReadonlyMap<'/' | '@', readonly string[]>,
): TextRefRange[] {
  if (lexicon.size === 0 || draft === '') return []
  const out: TextRefRange[] = []
  const slashNames = lexicon.get('/')
  if (slashNames !== undefined && slashNames.length > 0) {
    SLASH_REF_RE.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = SLASH_REF_RE.exec(draft)) !== null) {
      const name = match[2] ?? ''
      if (!slashNames.includes(name)) continue
      const start = match.index + (match[1]?.length ?? 0)
      out.push({ start, end: start + 1 + name.length, trigger: '/' })
    }
  }
  const atNames = lexicon.get('@')
  if (atNames !== undefined && atNames.length > 0) {
    const known = new Set(atNames)
    let index = 0
    while (index < draft.length) {
      const at = draft.indexOf('@', index)
      if (at < 0) break
      if (at > 0 && !/\s/u.test(draft.charAt(at - 1))) {
        index = at + 1
        continue
      }
      const mention = readAtMention(draft, at)
      if (mention !== undefined && known.has(mention.name)) {
        out.push({ start: at, end: mention.end, trigger: '@' })
        index = mention.end
        continue
      }
      index = at + 1
    }
  }
  return out
}

/** The mention/command name inside a decorated range (no trigger char, unquoted). */
export function textRefName(draft: string, range: TextRefRange): string {
  if (range.trigger === '@') {
    return readAtMention(draft, range.start)?.name ?? draft.slice(range.start + 1, range.end)
  }
  return draft.slice(range.start + 1, range.end)
}

/** True when another lexicon name continues this one — keep end-of-token Backspace character-wise. */
export function atNameIsPrefix(name: string, names: readonly string[]): boolean {
  return names.some(candidate => candidate !== name && candidate.startsWith(name))
}

/** File-shaped `@` mention (path, extension, or quoted name) — not a bare subagent label. */
export function isFileMentionPath(name: string): boolean {
  return name !== '' && name !== '.' && !name.endsWith('/') && /[./\\ ]/.test(name)
}

function readAtMention(draft: string, at: number): { name: string; end: number } | undefined {
  if (draft.charAt(at + 1) === '"') {
    let name = ''
    for (let cursor = at + 2; cursor < draft.length; cursor += 1) {
      const char = draft.charAt(cursor)
      if (char === '\n') return undefined
      if (char === '\\' && cursor + 1 < draft.length) {
        name += draft.charAt(cursor + 1)
        cursor += 1
        continue
      }
      if (char === '"') return { name, end: cursor + 1 }
      name += char
    }
    return undefined
  }
  let end = at + 1
  while (end < draft.length && !/\s/u.test(draft.charAt(end))) end += 1
  if (end === at + 1) return undefined
  return { name: draft.slice(at + 1, end), end }
}

/** The empty lexicon (default: zero text-ref decorations, old call sites unchanged). */
const EMPTY_LEXICON: ReadonlyMap<'/' | '@', readonly string[]> = new Map()

/**
 * Derive the mirror-layer decorations from the input state.
 * @param state - published input state.
 * @param lexicon - optional per-trigger reference lexicons (plain-text-reference scan).
 * @returns token range, chip instructions, text-ref ranges, and the ghost hint.
 */
export function deriveDecorations(
  state: InputState, lexicon: ReadonlyMap<'/' | '@', readonly string[]> = EMPTY_LEXICON,
): DraftDecorations {
  const { draft, claim, phase, occurrences } = state
  const claimActive = (phase === 'claimed' || phase === 'submitting')
    && claim !== undefined && draft.startsWith(claim.token)
  const token: TokenRange | null = claimActive ? { start: 0, end: claim.token.length } : null
  const chips = occurrences.map(o => ({
    occurrenceId: o.occurrenceId,
    offset: o.offset,
    label: o.label,
    invalid: o.invalid === true,
  }))
  const hint = claimActive && claim.hint !== undefined && draft.slice(claim.token.length).trim() === ''
    ? claim.hint
    : null
  return { token, chips, textRefs: scanTextRefs(draft, lexicon), hint }
}
