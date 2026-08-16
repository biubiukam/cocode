/**
 * Glyph set for every structural symbol the UI draws.
 *
 * Symbols are a token layer of their own, orthogonal to color: the theme
 * follows the user's light/dark preference, the glyph set follows what the
 * terminal can actually render. Keeping them here also stops the same rail or
 * status mark from drifting between components.
 *
 * Inline separators (` · `) stay as literals; they are punctuation inside
 * sentences, not structure, and every terminal that reaches this code renders
 * them.
 */

export type Glyphs = {
  /** Tool and task status marks, paired with color so state never relies on hue alone. */
  successMark: string
  runningMark: string
  waitingMark: string
  errorMark: string
  canceledMark: string
  /**
   * Turn rail: one cell left of every message and tool body, so an assistant
   * reply and the tools it called read as one continuous vertical line.
   */
  rail: string
  railSelected: string
  /** List and menu selection. */
  optionActive: string
  optionInactive: string
  /** Checklist item states. */
  checkDone: string
  checkActive: string
  checkTodo: string
  panelMark: string
  searchMark: string
  editMark: string
  resizeMark: string
  chevronDown: string
  listBullet: string
  quoteRail: string
  rule: string
  idleMark: string
  deadMark: string
  spinner: readonly string[]
  startingSpinner: readonly string[]
}

const unicodeGlyphs: Glyphs = {
  successMark: '✓',
  runningMark: '◌',
  waitingMark: '…',
  errorMark: '×',
  canceledMark: '−',
  rail: '│',
  railSelected: '▌',
  optionActive: '▸',
  optionInactive: '·',
  checkDone: '✓',
  checkActive: '●',
  checkTodo: '○',
  panelMark: '◆',
  searchMark: '⌕',
  editMark: '✎',
  resizeMark: '⇄',
  chevronDown: '⌄',
  listBullet: '•',
  quoteRail: '│',
  rule: '─',
  idleMark: '●',
  deadMark: '×',
  spinner: ['◐', '◓', '◑', '◒'],
  startingSpinner: ['○', '◌', '◍', '◌'],
}

const asciiGlyphs: Glyphs = {
  successMark: '+',
  runningMark: '*',
  waitingMark: '.',
  errorMark: 'x',
  canceledMark: '-',
  rail: '|',
  railSelected: '|',
  optionActive: '>',
  optionInactive: ' ',
  checkDone: '+',
  checkActive: '*',
  checkTodo: 'o',
  panelMark: '*',
  searchMark: '/',
  editMark: '+',
  resizeMark: '=',
  chevronDown: 'v',
  listBullet: '*',
  quoteRail: '|',
  rule: '-',
  idleMark: '*',
  deadMark: 'x',
  spinner: ['-', '\\', '|', '/'],
  startingSpinner: ['.', 'o', 'O', 'o'],
}

/** Mutable singleton, mirroring `theme`, so detection happens once at startup. */
export const glyphs: Glyphs = { ...unicodeGlyphs }

export function resolveGlyphs(unicode: boolean): Glyphs {
  return unicode ? unicodeGlyphs : asciiGlyphs
}

/**
 * Assume Unicode unless the environment says otherwise: a false negative costs
 * every user a degraded screen, while a false positive only affects terminals
 * that already announce a non-UTF-8 locale.
 */
export function supportsUnicode(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): boolean {
  if (platform === 'win32') {
    return Boolean(env.WT_SESSION || env.TERM_PROGRAM || env.ConEmuANSI || env.TERMINAL_EMULATOR)
  }
  const locale = env.LC_ALL ?? env.LC_CTYPE ?? env.LANG
  if (locale === undefined || locale === '') return true
  return /utf-?8/i.test(locale)
}

export function setGlyphs(unicode: boolean): void {
  Object.assign(glyphs, resolveGlyphs(unicode))
}
