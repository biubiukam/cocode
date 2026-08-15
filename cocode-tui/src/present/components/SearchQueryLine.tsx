import { Text } from 'ink'
import { theme } from '../theme.ts'

export function SearchQueryLine(props: { query: string; placeholder: string }) {
  return (
    <Text
      color={props.query === '' ? theme.mute : theme.text}
      backgroundColor={props.query === '' ? undefined : theme.border}
      wrap="truncate-end"
    >
      <Text color={theme.accent}>⌕</Text>{' '}
      {props.query === '' ? props.placeholder : props.query}
    </Text>
  )
}
