/**
 * Theme tokens. Brand color is focus-only.
 */

export type ThemeName = 'dark' | 'light'

export type ThemeTokens = {
  brand: string
  text: string
  dim: string
  mute: string
  border: string
  user: string
  assistant: string
  tool: string
  success: string
  error: string
  info: string
  running: string
}

export const themes: Record<ThemeName, ThemeTokens> = {
  dark: {
    brand: '#7EB8D4',
    text: '#D6D3D1',
    dim: '#A8A29E',
    mute: '#78716C',
    border: '#44403C',
    user: '#E7E5E4',
    assistant: '#D6D3D1',
    tool: '#A8A29E',
    success: '#86EFAC',
    error: '#FCA5A5',
    info: '#93C5FD',
    running: '#FDE68A',
  },
  light: {
    brand: '#25627A',
    text: '#292524',
    dim: '#57534E',
    mute: '#78716C',
    border: '#D6D3D1',
    user: '#1C1917',
    assistant: '#292524',
    tool: '#57534E',
    success: '#166534',
    error: '#B91C1C',
    info: '#1D4ED8',
    running: '#A16207',
  },
}

export const theme = themes.dark

export function getTheme(name: ThemeName): ThemeTokens {
  return themes[name]
}

export function parseThemeName(input: string): ThemeName | undefined {
  const name = input.trim().toLowerCase()
  return name === 'dark' || name === 'light' ? name : undefined
}

export function setTheme(name: ThemeName): void {
  Object.assign(theme, themes[name])
}
