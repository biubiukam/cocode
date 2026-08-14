/**
 * The panel chooser behind a Dock's `＋` button and its empty state.
 * It reads registered views, so a new panel appears here with no change to the Dock.
 */

import type { ReactNode } from 'react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from '@cocode/ui'
import { asPanelView } from '../../panels/types.ts'
import { usePanels } from '../runtime-context.tsx'

export function PanelPicker({ children, onSelect }: { children: ReactNode; onSelect(panelId: string): void }) {
  const views = usePanels().listViews().flatMap(view => {
    const definition = asPanelView(view)
    return definition === undefined ? [] : [definition]
  })
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          {views.map(definition => {
            const Icon = definition.icon
            return (
              <DropdownMenuItem
                key={definition.id}
                icon={<Icon className="size-3.5" />}
                onSelect={() => onSelect(definition.id)}
              >
                {definition.title}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
