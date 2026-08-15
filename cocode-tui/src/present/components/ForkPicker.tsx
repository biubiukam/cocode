import type { RewindPickerState } from '../../runtime/rewind-picker.ts'
import type { UiLocale } from '../../runtime/ui-locale.ts'
import { sanitizeSingleLine, truncateText } from '../text-format.ts'
import { BoundaryPicker } from './BoundaryPicker.tsx'

export function ForkPicker(props: {
  state: RewindPickerState
  locale: UiLocale
  maxRows?: number
}) {
  return (
    <BoundaryPicker
      state={props.state}
      locale={props.locale}
      maxRows={props.maxRows}
      titleKey="forkTitle"
      hintKey="forkHint"
      confirmKey="forkConfirm"
      emptyKey="forkEmpty"
      formatItem={(value) => truncateText(sanitizeSingleLine(value), 72)}
    />
  )
}
