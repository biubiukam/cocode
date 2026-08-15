import { Box, Text } from 'ink'
import type { SessionTodo } from '../../runtime/session-state.ts'
import { checklistCounts } from '../../runtime/checklist.ts'
import { text, type UiLocale } from '../../runtime/ui-locale.ts'
import { theme } from '../theme.ts'
import { ChecklistItem } from './ChecklistItem.tsx'

export const CHECKLIST_STRIP_MAX_ITEMS = 4

export function checklistStripRows(todoCount: number, maxItems = CHECKLIST_STRIP_MAX_ITEMS): number {
  if (todoCount <= 0) return 0
  const visible = Math.min(todoCount, Math.max(1, maxItems))
  return visible + 4 + Number(todoCount > visible)
}

export function ChecklistStrip(props: {
  todos: readonly SessionTodo[]
  locale: UiLocale
  maxItems?: number
}) {
  if (props.todos.length === 0) return null
  const maxItems = Math.max(1, props.maxItems ?? CHECKLIST_STRIP_MAX_ITEMS)
  const visible = props.todos.slice(0, maxItems)
  const remaining = props.todos.length - visible.length
  const counts = checklistCounts(props.todos)
  return (
    <Box
      width="100%"
      flexShrink={0}
      flexDirection="column"
      marginTop={1}
      borderStyle="round"
      borderColor={theme.border}
      paddingX={1}
    >
      <Text color={theme.accent} bold wrap="truncate-end">
        {text(props.locale, 'checklistTitle')}{' '}
        <Text color={theme.mute}>
          · {counts.completed}/{counts.total}
        </Text>
      </Text>
      {visible.map((todo, index) => (
        <ChecklistItem key={`${String(index)}:${todo.content}`} todo={todo} />
      ))}
      {remaining > 0 ? (
        <Text color={theme.mute} wrap="truncate-end">
          {text(props.locale, 'checklistMore', { count: String(remaining) })}
        </Text>
      ) : null}
    </Box>
  )
}
