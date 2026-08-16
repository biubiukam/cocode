import { Box, Text } from 'ink'
import {
  CHECKLIST_WINDOW_SIZE,
  checklistCounts,
  type ChecklistState,
} from '../../runtime/checklist.ts'
import type { SessionTodo } from '../../runtime/session-state.ts'
import { text, type UiLocale } from '../../runtime/ui-locale.ts'
import { listWindowStart } from '../list-window.ts'
import { PANEL_BORDER } from '../layout.ts'
import { theme } from '../theme.ts'
import { ChecklistItem } from './ChecklistItem.tsx'

export function ChecklistPanel(props: {
  state: ChecklistState
  todos: readonly SessionTodo[]
  locale: UiLocale
  maxRows?: number
}) {
  const counts = checklistCounts(props.todos)
  const windowSize =
    props.maxRows === undefined
      ? CHECKLIST_WINDOW_SIZE
      : Math.max(1, Math.min(CHECKLIST_WINDOW_SIZE, Math.trunc(props.maxRows) - 4))
  const start = listWindowStart(props.state.selected, props.todos.length, windowSize)
  const visible = props.todos.slice(start, start + windowSize)
  const hiddenBelow = props.todos.length - start - visible.length

  return (
    <Box
      flexDirection="column"
      marginTop={1}
      borderStyle={PANEL_BORDER}
      borderColor={theme.border}
      paddingX={1}
    >
      <Text color={theme.text} bold wrap="truncate-end">
        {text(props.locale, 'checklistTitle')}{' '}
        <Text color={theme.mute}>
          · {counts.completed}/{counts.total} · {text(props.locale, 'checklistHint')}
        </Text>
      </Text>
      {start > 0 ? <Text color={theme.mute}>↑ {start}</Text> : null}
      {visible.length === 0 ? (
        <Text color={theme.mute}>{text(props.locale, 'checklistEmpty')}</Text>
      ) : (
        visible.map((todo, offset) => (
          <ChecklistItem
            key={`${String(start + offset)}:${todo.content}`}
            todo={todo}
            selected={start + offset === props.state.selected}
          />
        ))
      )}
      {hiddenBelow > 0 ? <Text color={theme.mute}>↓ {hiddenBelow}</Text> : null}
    </Box>
  )
}
