import { Text } from 'ink'
import type { SessionTodo } from '../../runtime/session-state.ts'
import { sanitizeSingleLine } from '../text-format.ts'
import { glyphs } from '../glyphs.ts'
import { selectionStyle } from '../selection.ts'
import { theme } from '../theme.ts'

export function ChecklistItem(props: { todo: SessionTodo; selected?: boolean }) {
  const { todo, selected = false } = props
  const mark =
    todo.status === 'completed'
      ? glyphs.checkDone
      : todo.status === 'in_progress'
      ? glyphs.checkActive
      : glyphs.checkTodo
  const color =
    todo.status === 'completed'
      ? theme.success
      : todo.status === 'in_progress'
      ? theme.accent
      : theme.mute
  const style = selectionStyle(selected)
  return (
    <Text
      {...style}
      color={selected ? style.color : color}
      bold={style.bold || todo.status === 'in_progress'}
      wrap="truncate-end"
    >
      {selected ? glyphs.optionActive : glyphs.optionInactive} {mark}{' '}
      {sanitizeSingleLine(todo.content)}
    </Text>
  )
}
