import type { RewindPickerState } from '../../runtime/rewind-picker.ts'
import type { UiLocale } from '../../runtime/ui-locale.ts'
import { BoundaryPicker } from './BoundaryPicker.tsx'

export function RewindPicker(props: {
  state: RewindPickerState
  locale: UiLocale
  maxRows?: number
}) {
  return (
    <BoundaryPicker
      state={props.state}
      locale={props.locale}
      maxRows={props.maxRows}
      titleKey="rewindTitle"
      hintKey="rewindHint"
      confirmKey="rewindConfirm"
      emptyKey="rewindEmpty"
    />
  )
}
