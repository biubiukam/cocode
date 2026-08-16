import { Text } from 'ink'
import { listWindowStart } from '../list-window.ts'
import { theme } from '../theme.ts'
import { text, type UiLocale } from '../../runtime/ui-locale.ts'
import { PanelFrame } from './PanelFrame.tsx'
import { panelCapacity } from '../panel-layout.ts'
import { SearchQueryLine } from './SearchQueryLine.tsx'
import { SelectionRow } from './SelectionRow.tsx'

export type SlashMenuItem = {
  name: string
  summary: string
  input?: { hint: string }
}

export function slashCommandLabel(item: SlashMenuItem): string {
  return item.input === undefined ? `/${item.name}` : `/${item.name} ${item.input.hint}`
}

/** Return the command text that Tab should place into the composer. */
export function slashCommandCompletion(item: SlashMenuItem): string {
  return item.input === undefined ? `/${item.name}` : `/${item.name} `
}

export function filterSlashItems<T extends SlashMenuItem>(
  items: readonly T[],
  draft: string,
): readonly T[] {
  if (!isSlashDraft(draft)) return []
  const prefix = draft.slice(1).toLocaleLowerCase()
  return items.filter((item) => item.name.toLocaleLowerCase().startsWith(prefix))
}

export function isSlashDraft(draft: string): boolean {
  return /^\/\S*$/.test(draft)
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
  query?: string
  maxRows?: number
}) {
  const selected = moveSlashSelection(props.selectedIndex, 0, props.items.length)
  const capacity = panelCapacity(props.maxRows, 4, props.items.length)
  const start = listWindowStart(selected, props.items.length, Math.max(1, capacity))
  const visible = capacity === 0 ? [] : props.items.slice(start, start + capacity)
  return (
    <PanelFrame
      title={text(props.locale, 'commands')}
      hint={text(props.locale, 'commandsHint')}
    >
      <SearchQueryLine
        query={props.query ?? ''}
        placeholder={text(props.locale, 'commandsFilter')}
      />
      {props.items.length === 0 ? (
        <Text color={theme.mute}>{text(props.locale, 'commandsEmpty')}</Text>
      ) : null}
      {visible.map((item, offset) => {
        const active = start + offset === selected
        return (
          <SelectionRow
            key={item.name}
            active={active}
            label={slashCommandLabel(item)}
            description={item.summary}
          />
        )
      })}
    </PanelFrame>
  )
}
