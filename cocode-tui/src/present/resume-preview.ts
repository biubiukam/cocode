import { text, type UiLocale } from '../runtime/ui-locale.ts'
import type { ResumePickerItem } from '../runtime/resume-picker.ts'
import { sanitizeSingleLine } from './text-format.ts'

const PREVIEW_MAX_LENGTH = 72

export function resumeItemPreview(
  item: Pick<ResumePickerItem, 'preview' | 'label'>,
  locale: UiLocale,
): string {
  const value = item.preview ?? item.label
  const normalized = value === undefined ? undefined : sanitizeSingleLine(value)
  if (normalized === undefined || normalized === '') return text(locale, 'resumeNoSummary')
  const characters = Array.from(normalized)
  return characters.length <= PREVIEW_MAX_LENGTH
    ? normalized
    : `${characters.slice(0, PREVIEW_MAX_LENGTH - 1).join('')}…`
}
