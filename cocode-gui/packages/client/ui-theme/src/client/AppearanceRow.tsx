/**
 * Appearance preference row registered into the General section item slot
 * (figma 501:30012 'Frame 2117131228'): title + two preference cubes.
 * Registered by this package — the theme feature owns its own settings
 * surface. The hidden system preference is represented by the resolved
 * light/dark scheme so the row reflects the operating-system theme without a
 * third user-facing option.
 */
import clsx from 'clsx'
import {
  BrandWordmark, IconDarkOutline16, IconLightOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { ThemePreference } from '../theme-settings.ts'
import type { ThemeKey } from './locales.ts'
import type { LogoPreference } from './logo-settings.ts'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { createAppearanceRowStore } from './settings-store.ts'
import css from './AppearanceRow.module.css'

/** Injected business face: the preference write (t rides the standard locale seat). */
export interface AppearanceRowInjected {
  /** Switch the theme preference. */
  setTheme: (id: ThemePreference) => void
  /** Switch the sidebar logo style. */
  setLogo: (id: LogoPreference) => void
}

/** Full component props: runtime share + store share + locale seat + injected face. */
export type AppearanceRowComponentProps =
  PropsRuntime<'settings.general.item'> & PropsStore<ReturnType<typeof createAppearanceRowStore>>
  & PropsLocale<'settings.theme'> & AppearanceRowInjected

/** Cube order and icons: the user-facing settings surface has two choices. */
const CUBES: readonly { id: ThemePreference; labelKey: ThemeKey; Icon: typeof IconLightOutline16 }[] = [
  { id: 'light', labelKey: 'appearance.light', Icon: IconLightOutline16 },
  { id: 'dark', labelKey: 'appearance.dark', Icon: IconDarkOutline16 },
]

const LOGO_CELL_WIDTH = 10
const LOGO_ROW_HEIGHT = 16
const LOGO_LINES = [
  ' ▄█████ ▄████▄ ▄█████ ▄████▄ █████▄ ▄█████',
  ' ██     ██  ██ ██     ██  ██ ██  ██ ██▄▄',
  ' ██     ██  ██ ██     ██  ██ ██  ██ ██▀▀',
  ' ▀█████ ▀████▀ ▀█████ ▀████▀ █████▀ ▀█████',
] as const

/** Settings preview for the exact cocode.agency pixel wordmark. */
function CocodeLogoPreview() {
  const blocks = LOGO_LINES.flatMap((line, rowIndex) => [...line].flatMap((glyph, columnIndex) => {
    const x = columnIndex * LOGO_CELL_WIDTH
    const y = rowIndex * LOGO_ROW_HEIGHT
    if (glyph === '█') return [<rect key={`${rowIndex}-${columnIndex}`} x={x} y={y} width={LOGO_CELL_WIDTH} height={LOGO_ROW_HEIGHT} />]
    if (glyph === '▄') return [<rect key={`${rowIndex}-${columnIndex}`} x={x} y={y + LOGO_ROW_HEIGHT / 2} width={LOGO_CELL_WIDTH} height={LOGO_ROW_HEIGHT / 2} />]
    if (glyph === '▀') return [<rect key={`${rowIndex}-${columnIndex}`} x={x} y={y} width={LOGO_CELL_WIDTH} height={LOGO_ROW_HEIGHT / 2} />]
    return []
  }))
  return (
    <svg width={118.125} height={18} viewBox="0 0 420 64" shapeRendering="crispEdges" aria-hidden="true">
      <g fill="currentColor">{blocks}</g>
    </svg>
  )
}

/**
 * Render the Appearance row.
 * @param props - composed slot props.
 * @returns the row element tree.
 */
export function AppearanceRow({ t, setTheme, setLogo, useStore }: AppearanceRowComponentProps) {
  const { preference, activeColorScheme, logoPreference } = useStore(s => s)
  const selected = preference === 'system' ? activeColorScheme : preference
  return (
    <div className={css.group}>
      <div className={css.title}>{t('appearance.title')}</div>
      <div className={css.cubeRow}>
        {CUBES.map(({ id, labelKey, Icon }) => (
          <button
            key={id}
            type="button"
            className={clsx(css.themeCube, selected === id && css.selected)}
            aria-pressed={selected === id}
            onClick={() => { setTheme(id) }}
          >
            <Icon />
            {t(labelKey)}
          </button>
        ))}
      </div>
      <div className={css.logoTitle}>{t('appearance.logo.title')}</div>
      <div className={css.cubeRow}>
        <button
          type="button"
          className={clsx(css.logoCube, logoPreference === 'cocode' && css.selected)}
          aria-pressed={logoPreference === 'cocode'}
          onClick={() => { setLogo('cocode') }}
        >
          <span className={css.logoPreview}><CocodeLogoPreview /></span>
          {t('appearance.logo.cocode')}
        </button>
        <button
          type="button"
          className={clsx(css.logoCube, logoPreference === 'deepseek' && css.selected)}
          aria-pressed={logoPreference === 'deepseek'}
          onClick={() => { setLogo('deepseek') }}
        >
          <span className={css.logoPreview}><BrandWordmark size={18} /></span>
          {t('appearance.logo.deepseek')}
        </button>
      </div>
    </div>
  )
}
