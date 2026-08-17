/**
 * Theme tokens, shared with the Cocode design system (design-system.md §1.1).
 *
 * Only the foreground half of the system applies here: a terminal's canvas
 * belongs to the user, so the `background` / `surface` layers have no terminal
 * equivalent. Hierarchy is carried by foreground contrast, message rails,
 * indentation and blank rows instead of by raised surfaces and shadows.
 *
 * Hues are capped at four: accent (blue), success, warning, danger. Blue is the
 * only accent and marks focus, selection and in-flight work; everything else is
 * neutral grey. A fifth hue would exceed what a reader can keep mapped.
 */

import { execFileSync } from 'node:child_process'

export type ThemeName = 'dark' | 'light'
export type ThemeMode = ThemeName | 'system'

export const DEFAULT_THEME: ThemeName = 'dark'

export type ThemeTokens = {
  /** Primary body text. Design system `--foreground`. */
  text: string
  /** Secondary text: metadata, tool output. `--muted-foreground`. */
  dim: string
  /** Tertiary text: hints, placeholders, separators. `--subtle-foreground`. */
  mute: string
  /**
   * Structural rules and panel borders. Taken from `--border-strong` rather
   * than `--border`, because the web token assumes a surface to contrast
   * against and is invisible over an arbitrary terminal background.
   */
  border: string
  /** Focus, selection, links, running state. `--accent-ink`. */
  accent: string
  /**
   * Weak accent fill for the selected row. `--accent-soft`. Undefined when the
   * terminal cannot render a background this subtle, in which case callers fall
   * back to inverse video.
   */
  accentSoft?: string
  success: string
  warning: string
  danger: string
}

export const themes: Record<ThemeName, ThemeTokens> = {
  dark: {
    text: '#F4F4F5',
    dim: '#A1A1AA',
    mute: '#7A7A85',
    border: '#414149',
    accent: '#60A5FA',
    accentSoft: '#0F1C33',
    success: '#67E6A0',
    warning: '#F5CF72',
    danger: '#FF9292',
  },
  light: {
    text: '#0A0A0A',
    dim: '#71717A',
    mute: '#A1A1AA',
    border: '#D4D4D8',
    accent: '#2563EB',
    accentSoft: '#EFF6FF',
    success: '#15803D',
    warning: '#A16207',
    danger: '#B91C1C',
  },
}

/**
 * Fallback for terminals without 24-bit color. Named ANSI colors follow the
 * user's own palette, which reads better than quantizing our hex values into
 * whichever 16 colors the terminal happens to define. `accentSoft` is dropped
 * because no named color is subtle enough to sit behind body text.
 */
const basicTokens: ThemeTokens = {
  text: 'white',
  dim: 'gray',
  mute: 'gray',
  border: 'gray',
  accent: 'cyan',
  success: 'green',
  warning: 'yellow',
  danger: 'red',
}

/** Mutable singleton so a theme switch repaints without remounting the tree. */
export const theme: ThemeTokens = { ...themes.dark }

export function resolveTheme(name: ThemeName, trueColor: boolean): ThemeTokens {
  return trueColor ? themes[name] : basicTokens
}

export type InitialThemeOptions = {
  platform?: NodeJS.Platform
  readSystemTheme?: () => ThemeName | undefined
}

/**
 * Pick a startup theme without making the terminal canvas part of the app
 * state. Explicit configuration wins; on macOS, AppleInterfaceStyle is the
 * source of truth. COLORFGBG remains a fallback for other terminal setups.
 */
export function resolveInitialTheme(
  env: NodeJS.ProcessEnv = process.env,
  options: InitialThemeOptions = {},
): ThemeName {
  const configured = parseThemeMode(env.COCODE_TUI_THEME ?? '')
  if (configured !== undefined && configured !== 'system') return configured

  const platform = options.platform ?? process.platform
  const systemTheme =
    platform === 'darwin'
      ? (options.readSystemTheme ?? readMacSystemTheme)()
      : undefined
  if (systemTheme !== undefined) return systemTheme

  const background = env.COLORFGBG?.split(';').at(-1)
  const backgroundId = background === undefined ? undefined : Number(background)
  if (Number.isInteger(backgroundId)) {
    if ([3, 6, 7, 10, 11, 14, 15].includes(backgroundId)) return 'light'
    if ([0, 1, 2, 4, 5, 8, 9, 12, 13].includes(backgroundId)) return 'dark'
  }

  return DEFAULT_THEME
}

function readMacSystemTheme(): ThemeName | undefined {
  try {
    const value = execFileSync('defaults', ['read', '-g', 'AppleInterfaceStyle'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .trim()
      .toLowerCase()
    return value === 'dark' ? 'dark' : value === 'light' ? 'light' : undefined
  } catch (error) {
    // macOS omits AppleInterfaceStyle in Light appearance. A missing command
    // is different and should continue to the other detection fallbacks.
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
      ? undefined
      : 'light'
  }
}

export function supportsTrueColor(
  stream: Pick<NodeJS.WriteStream, 'getColorDepth'> | undefined = process.stdout,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const colorterm = env.COLORTERM?.toLowerCase() ?? ''
  if (colorterm === 'truecolor' || colorterm === '24bit') return true
  try {
    return (stream?.getColorDepth?.() ?? 0) >= 24
  } catch {
    return false
  }
}

export function getTheme(name: ThemeName): ThemeTokens {
  return themes[name]
}

export function parseThemeName(input: string): ThemeName | undefined {
  const name = input.trim().toLowerCase()
  return name === 'dark' || name === 'light' ? name : undefined
}

export function parseThemeMode(input: string): ThemeMode | undefined {
  const mode = input.trim().toLowerCase()
  return mode === 'system' ? 'system' : parseThemeName(mode)
}

export function setTheme(name: ThemeName, trueColor = supportsTrueColor()): void {
  const next = resolveTheme(name, trueColor)
  // Delete first so an optional token dropped by the fallback does not linger.
  for (const key of Object.keys(theme)) delete theme[key as keyof ThemeTokens]
  Object.assign(theme, next)
}
