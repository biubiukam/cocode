import { Text } from 'ink'
import { theme } from '../theme.ts'

export function SelectionRow(props: {
  active: boolean
  label: string
  description?: string
  shortcut?: string
}) {
  return (
    <Text
      color={props.active ? theme.text : theme.dim}
      inverse={props.active}
      bold={props.active}
      wrap="truncate-end"
    >
      <Text color={props.active ? theme.accent : theme.mute}>
        {props.active ? '▸' : '·'}
      </Text>{' '}
      {props.label}
      {props.description !== undefined ? (
        <Text color={props.active ? theme.text : theme.mute}> · {props.description}</Text>
      ) : null}
      {props.shortcut !== undefined ? (
        <Text color={props.active ? theme.text : theme.mute}>  {props.shortcut}</Text>
      ) : null}
    </Text>
  )
}
