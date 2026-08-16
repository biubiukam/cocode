import { theme } from './theme.ts'

export type SelectionStyle = {
  color: string
  backgroundColor: string | undefined
  inverse: boolean
  bold: boolean
}

/**
 * One selected-row appearance for every list in the UI.
 *
 * The design system marks selection with a soft accent fill, not inverse video:
 * inverse paints a full-width high-contrast slab that pulls the eye away from
 * the content it is supposed to highlight. Terminals that cannot render a fill
 * this subtle drop `accentSoft` from the theme and fall back to inverse, which
 * is worse-looking but never invisible.
 */
export function selectionStyle(active: boolean): SelectionStyle {
  if (!active) return { color: theme.dim, backgroundColor: undefined, inverse: false, bold: false }
  return {
    color: theme.text,
    backgroundColor: theme.accentSoft,
    inverse: theme.accentSoft === undefined,
    bold: true,
  }
}
