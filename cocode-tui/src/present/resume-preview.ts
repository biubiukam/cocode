/* eslint-disable no-control-regex */

import { text, type UiLocale } from '../runtime/ui-locale.ts'
import type { ResumePickerItem } from '../runtime/resume-picker.ts'

const PREVIEW_MAX_LENGTH = 72

export function resumeItemPreview(
  item: Pick<ResumePickerItem, 'preview' | 'label'>,
  locale: UiLocale,
): string {
  const value = item.preview ?? item.label
  // ANSI and control characters must not reach the terminal renderer.
  // eslint-disable-next-line no-control-regex
  const normalized = value
    ?.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (normalized === undefined || normalized === '') return text(locale, 'resumeNoSummary')
  const characters = Array.from(normalized)
  return characters.length <= PREVIEW_MAX_LENGTH
    ? normalized
    : `${characters.slice(0, PREVIEW_MAX_LENGTH - 1).join('')}…`
}
