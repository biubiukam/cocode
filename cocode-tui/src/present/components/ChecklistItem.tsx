import { Text } from 'ink'
import type { SessionTodo } from '../../runtime/session-state.ts'
import { sanitizeSingleLine } from '../text-format.ts'
import { theme } from '../theme.ts'

export function ChecklistItem(props: { todo: SessionTodo; selected?: boolean }) {
  const { todo, selected = false } = props
  const mark = todo.status === 'completed' ? '✓' : todo.status === 'in_progress' ? '●' : '○'
  const color =
    todo.status === 'completed'
      ? theme.success
      : todo.status === 'in_progress'
      ? theme.info
      : theme.mute
  return (
    <Text
      color={selected ? theme.text : color}
      inverse={selected}
      bold={todo.status === 'in_progress'}
      wrap="truncate-end"
    >
      {selected ? '›' : ' '} {mark} {sanitizeSingleLine(todo.content)}
    </Text>
  )
}
