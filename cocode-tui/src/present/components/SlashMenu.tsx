import { Box, Text } from 'ink'
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
}) {
  if (props.items.length === 0) return null
  const selected = moveSlashSelection(props.selectedIndex, 0, props.items.length)
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
      {props.items.map((item, index) => {
        const active = index === selected
        return (
          <Text key={item.name} color={active ? theme.text : theme.mute} inverse={active}>
            {active ? '›' : ' '} /{item.name}{' '}
            <Text color={active ? theme.text : theme.dim}>· {item.summary}</Text>
          </Text>
        )
      })}
    </Box>
  )
}
