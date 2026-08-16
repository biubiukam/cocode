import { Text } from 'ink'
import { glyphs } from '../glyphs.ts'
import { selectionStyle } from '../selection.ts'
import { theme } from '../theme.ts'

export function SelectionRow(props: {
  active: boolean
  label: string
  description?: string
  shortcut?: string
}) {
  const style = selectionStyle(props.active)
  const detailColor = props.active ? theme.dim : theme.mute
  return (
    <Text {...style} wrap="truncate-end">
      <Text color={props.active ? theme.accent : theme.mute}>
        {props.active ? glyphs.optionActive : glyphs.optionInactive}
      </Text>{' '}
      {props.label}
      {props.description !== undefined ? (
        <Text color={detailColor}> · {props.description}</Text>
      ) : null}
      {props.shortcut !== undefined ? <Text color={detailColor}>  {props.shortcut}</Text> : null}
    </Text>
  )
}
