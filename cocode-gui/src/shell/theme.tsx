/**
 * Theme mode. The tokens define both palettes; this only decides which one the
 * document declares, and keeps `color-scheme` in step so native controls follow.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type ThemeSetting = 'light' | 'dark' | 'system'
export type ThemeMode = 'light' | 'dark'

const STORAGE_KEY = 'cocode.theme'

type ThemeContextValue = {
  setting: ThemeSetting
  mode: ThemeMode
  setSetting(setting: ThemeSetting): void
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

function readStored(): ThemeSetting {
  try {
    const raw = globalThis.localStorage.getItem(STORAGE_KEY)
    return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'system'
  }
  catch {
    return 'system'
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [setting, setSettingState] = useState<ThemeSetting>(readStored)
  const [systemMode, setSystemMode] = useState<ThemeMode>(
    () => (globalThis.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  )

  useEffect(() => {
    const query = globalThis.matchMedia('(prefers-color-scheme: dark)')
    const update = (event: MediaQueryListEvent) => setSystemMode(event.matches ? 'dark' : 'light')
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  const mode: ThemeMode = setting === 'system' ? systemMode : setting

  useEffect(() => {
    document.documentElement.dataset['theme'] = mode
  }, [mode])

  const setSetting = useCallback((next: ThemeSetting) => {
    setSettingState(next)
    try {
      globalThis.localStorage.setItem(STORAGE_KEY, next)
    }
    catch {
      // Storage denial only costs the preference its persistence.
    }
  }, [])

  const value = useMemo(() => ({ setting, mode, setSetting }), [setting, mode, setSetting])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext)
  if (value === undefined) throw new Error('useTheme must be used inside ThemeProvider')
  return value
}

/** The palette actually in force. */
export function useThemeMode(): ThemeMode {
  return useTheme().mode
}

export function useThemeSetting(): [ThemeSetting, (setting: ThemeSetting) => void] {
  const { setting, setSetting } = useTheme()
  return [setting, setSetting]
}
