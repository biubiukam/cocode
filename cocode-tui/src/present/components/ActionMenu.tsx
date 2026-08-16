import { Text } from 'ink'
import { listWindowStart } from '../list-window.ts'
import { theme } from '../theme.ts'
import { PanelFrame } from './PanelFrame.tsx'
import { SearchQueryLine } from './SearchQueryLine.tsx'
import { SelectionRow } from './SelectionRow.tsx'

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
  queryPlaceholder?: string
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
    <PanelFrame title={props.title} hint={props.hint}>
      {props.query !== undefined ? (
        <SearchQueryLine
          query={props.query}
          placeholder={props.queryPlaceholder ?? 'type to filter'}
        />
      ) : null}
      {visible.length > 0 ? visible.map((item, offset) => {
        const active = start + offset === selected
        return (
          <SelectionRow
            key={item.id}
            active={active}
            label={item.label}
            description={item.description}
            shortcut={item.shortcut}
          />
        )
      }) : (
        <Text color={theme.mute}>{props.emptyLabel ?? 'No actions'}</Text>
      )}
    </PanelFrame>
  )
}

function selectedIndexFor(index: number, count: number): number {
  if (count <= 0) return 0
  const normalized = Number.isFinite(index) ? Math.trunc(index) : 0
  return ((normalized % count) + count) % count
}
