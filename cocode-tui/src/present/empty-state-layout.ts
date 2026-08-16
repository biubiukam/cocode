import { HORIZONTAL_WHALE_MIN_COLUMNS, type WhaleLogoSize } from './whale-animation.ts'

export type EmptyStateLayout = {
  logoSize: WhaleLogoSize
  showTitle: boolean
  showHint: boolean
}

export function emptyStateLayout(
  maxRows: number | undefined,
  maxColumns?: number,
): EmptyStateLayout {
  if (maxColumns !== undefined && maxColumns < HORIZONTAL_WHALE_MIN_COLUMNS) {
    return { logoSize: 'inline', showTitle: false, showHint: false }
  }
  if (maxColumns !== undefined && maxColumns < 72) {
    if (maxRows === undefined || maxRows >= 10) {
      return { logoSize: 'medium', showTitle: true, showHint: true }
    }
    if (maxRows >= 9) return { logoSize: 'small', showTitle: true, showHint: false }
    return { logoSize: 'inline', showTitle: false, showHint: false }
  }
  if (maxRows === undefined || maxRows >= 17) {
    return { logoSize: 'large', showTitle: true, showHint: true }
  }
  if (maxRows >= 10) {
    return { logoSize: 'medium', showTitle: true, showHint: true }
  }
  if (maxRows >= 9) {
    return { logoSize: 'small', showTitle: true, showHint: false }
  }
  return { logoSize: 'inline', showTitle: false, showHint: false }
}
