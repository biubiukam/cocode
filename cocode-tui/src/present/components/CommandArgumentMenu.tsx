import { Text } from 'ink'
import { listWindowStart } from '../list-window.ts'
import { theme } from '../theme.ts'
import { text, type UiLocale } from '../../runtime/ui-locale.ts'
import { PanelFrame } from './PanelFrame.tsx'
import { panelCapacity } from '../panel-layout.ts'
import { SearchQueryLine } from './SearchQueryLine.tsx'
import { SelectionRow } from './SelectionRow.tsx'
import type { CommandArgumentCompletion } from '../command-completion.ts'

export function CommandArgumentMenu(props: {
  commandName: string
  items: readonly CommandArgumentCompletion[]
  selectedIndex: number
  query: string
  locale: UiLocale
  maxRows?: number
}) {
  const selected = moveSelection(props.selectedIndex, props.items.length)
  const capacity = panelCapacity(props.maxRows, 4, props.items.length)
  const start = listWindowStart(selected, props.items.length, Math.max(1, capacity))
  const visible = capacity === 0 ? [] : props.items.slice(start, start + capacity)
  return (
    <PanelFrame
      title={`/${props.commandName}`}
      hint={text(props.locale, 'commandArgumentsHint')}
    >
      <SearchQueryLine
        query={props.query}
        placeholder={text(props.locale, 'commandArgumentsFilter')}
      />
      {props.items.length === 0 ? (
        <Text color={theme.mute}>{text(props.locale, 'commandArgumentsEmpty')}</Text>
      ) : null}
      {visible.map((item, offset) => (
        <SelectionRow
          key={`${item.label}:${item.insert}`}
          active={start + offset === selected}
          label={item.label}
        />
      ))}
    </PanelFrame>
  )
}

function moveSelection(index: number, count: number): number {
  if (count <= 0) return 0
  const safe = Number.isFinite(index) ? Math.trunc(index) : 0
  return ((safe % count) + count) % count
}
