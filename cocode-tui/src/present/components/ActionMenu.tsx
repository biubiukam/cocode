import { Box, Text } from 'ink'
import { listWindowStart } from '../list-window.ts'
import { theme } from '../theme.ts'

export type ActionMenuItem = {
  id: string
  label: string
  description?: string
  shortcut?: string
}

export function ActionMenu(props: {
  title: string
  hint: string
  items: readonly ActionMenuItem[]
  selectedIndex: number
  maxRows?: number
  query?: string
  emptyLabel?: string
}) {
  const selected = selectedIndexFor(props.selectedIndex, props.items.length)
  const queryRows = props.query === undefined ? 0 : 1
  const capacity = Math.max(
    0,
    Math.min(props.items.length, Math.trunc(props.maxRows ?? Number.MAX_SAFE_INTEGER) - 4 - queryRows),
  )
  const start = listWindowStart(selected, props.items.length, Math.max(1, capacity))
  const visible = capacity === 0 ? [] : props.items.slice(start, start + capacity)

  return (
    <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor={theme.border} paddingX={1}>
      <Text color={theme.brand} bold>
        {props.title} <Text color={theme.mute}>· {props.hint}</Text>
      </Text>
      {props.query !== undefined ? (
        <Text color={theme.mute} wrap="truncate-end">
          {props.query === '' ? '⌕ ' : `⌕ ${props.query}`}
        </Text>
      ) : null}
      {visible.length > 0 ? visible.map((item, offset) => {
        const active = start + offset === selected
        return (
          <Text key={item.id} color={active ? theme.text : theme.mute} inverse={active} wrap="truncate-end">
            {active ? '›' : ' '} {item.label}
            {item.description !== undefined ? <Text color={active ? theme.text : theme.dim}> · {item.description}</Text> : null}
            {item.shortcut !== undefined ? <Text color={active ? theme.text : theme.dim}>  {item.shortcut}</Text> : null}
          </Text>
        )
      }) : (
        <Text color={theme.mute}>{props.emptyLabel ?? 'No actions'}</Text>
      )}
    </Box>
  )
}

function selectedIndexFor(index: number, count: number): number {
  if (count <= 0) return 0
  const normalized = Number.isFinite(index) ? Math.trunc(index) : 0
  return ((normalized % count) + count) % count
}
