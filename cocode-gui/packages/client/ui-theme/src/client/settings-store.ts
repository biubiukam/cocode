/**
 * Appearance row slot store: a mirror of the theme service snapshot. The
 * plugin's apply-world change listener is the only writer; the row component
 * reads via props.useStore.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'
import type { ThemePreference } from '../theme-settings.ts'
import type { LogoPreference } from './logo-settings.ts'

/** Store state mirrored from the theme snapshot. */
export interface AppearanceRowState {
  /** Persisted preference (light, dark, or system/auto). */
  preference: ThemePreference
  /** Resolved scheme while preference is `system`. */
  activeColorScheme: 'light' | 'dark'
  /** Selected sidebar logo style. */
  logoPreference: LogoPreference
  /** Service revision; -1 until first sync so revision 0 lands as a change. */
  revision: number
}

/** Declared action shape giving the exported factory a stable return type. */
type AppearanceRowActions = {
  sync: (
    draft: AppearanceRowState,
    preference: ThemePreference,
    activeColorScheme: 'light' | 'dark',
    logoPreference: LogoPreference,
    revision: number,
  ) => void
}

/**
 * Declares the Appearance row state and write surface.
 * @returns the store handle.
 */
export function createAppearanceRowStore(): EngineStoreHandle<AppearanceRowState, AppearanceRowActions> {
  return defineStore({
    init: (): AppearanceRowState => ({
      preference: 'system',
      activeColorScheme: 'light',
      logoPreference: 'cocode',
      revision: -1,
    }),
    actions: {
      sync: (
        d,
        preference: ThemePreference,
        activeColorScheme: 'light' | 'dark',
        logoPreference: LogoPreference,
        revision: number,
      ) => {
        if (revision <= d.revision) return
        d.preference = preference
        d.activeColorScheme = activeColorScheme
        d.logoPreference = logoPreference
        d.revision = revision
      },
    },
  })
}
