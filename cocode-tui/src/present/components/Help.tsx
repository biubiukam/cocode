import { Text } from 'ink'
import { text, type UiLocale } from '../../runtime/ui-locale.ts'
import { PanelFrame } from './PanelFrame.tsx'
import { theme } from '../theme.ts'

export function Help(props: { text: string; locale: UiLocale; maxRows?: number }) {
  const lines = props.text.split('\n')
  const capacity =
    props.maxRows === undefined
      ? lines.length
      : Math.max(0, Math.min(lines.length, Math.trunc(props.maxRows) - 4))
  const visible = lines.slice(0, capacity)
  if (capacity > 0 && capacity < lines.length) visible[capacity - 1] = '…'
  return (
    <PanelFrame
      title={text(props.locale, 'help')}
      hint={text(props.locale, 'helpHint')}
    >
      {visible.map((line, index) => (
        <Text key={`${index}:${line}`} color={theme.dim} wrap="truncate-end">
          {line === '' ? ' ' : line}
        </Text>
      ))}
    </PanelFrame>
  )
}
