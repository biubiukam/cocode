import { Box, Text } from 'ink'
import { listWindowStart } from '../list-window.ts'
import { theme } from '../theme.ts'
import { text, type UiLocale } from '../../runtime/ui-locale.ts'

export type SlashMenuItem = {
  name: string
  summary: string
}

export function filterSlashItems<T extends SlashMenuItem>(
  items: readonly T[],
  draft: string,
): readonly T[] {
  if (!/^\/\S*$/.test(draft)) return []
  const prefix = draft.slice(1).toLowerCase()
  return items.filter((item) => item.name.toLowerCase().startsWith(prefix))
}

export function moveSlashSelection(
  selectedIndex: number,
  delta: number,
  itemCount: number,
): number {
  if (itemCount <= 0) return 0
  const current = Number.isFinite(selectedIndex) ? Math.trunc(selectedIndex) : 0
  const offset = Number.isFinite(delta) ? Math.trunc(delta) : 0
  const next = current + offset
  return ((next % itemCount) + itemCount) % itemCount
}

export function selectedSlashItem<T>(items: readonly T[], selectedIndex: number): T | undefined {
  if (items.length === 0) return undefined
  return items[moveSlashSelection(selectedIndex, 0, items.length)]
}

export function SlashMenu(props: {
  items: readonly SlashMenuItem[]
  selectedIndex: number
  locale: UiLocale
  maxRows?: number
}) {
  if (props.items.length === 0) return null
  const selected = moveSlashSelection(props.selectedIndex, 0, props.items.length)
  const capacity = panelCapacity(props.maxRows, 4, props.items.length)
  const start = listWindowStart(selected, props.items.length, Math.max(1, capacity))
  const visible = capacity === 0 ? [] : props.items.slice(start, start + capacity)
  return (
    <Box
      flexDirection="column"
      marginTop={1}
      borderStyle="round"
      borderColor={theme.border}
      paddingX={1}
    >
      <Text color={theme.dim} bold>
        {text(props.locale, 'commands')}{' '}
        <Text color={theme.mute}>· {text(props.locale, 'commandsHint')}</Text>
      </Text>
      {visible.map((item, offset) => {
        const active = start + offset === selected
        return (
          <Text
            key={item.name}
            color={active ? theme.text : theme.mute}
            inverse={active}
            wrap="truncate-end"
          >
            {active ? '›' : ' '} /{item.name}{' '}
            <Text color={active ? theme.text : theme.dim}>· {item.summary}</Text>
          </Text>
        )
      })}
    </Box>
  )
}

function panelCapacity(maxRows: number | undefined, chromeRows: number, count: number): number {
  if (maxRows === undefined) return count
  return Math.max(0, Math.min(count, Math.trunc(maxRows) - chromeRows))
}
