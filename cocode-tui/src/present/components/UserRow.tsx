import { memo } from 'react'
import type { UserNode } from '../../runtime/nodes/types.ts'
import { theme } from '../theme.ts'
import type { UiLocale } from '../../runtime/ui-locale.ts'
import { MessageRail } from './MessageRail.tsx'
import { SelectableText } from './SelectableText.tsx'
import type { MessageTextRange } from '../message-text-selection.ts'

// Nodes are republished as new objects when they change, so identity props let
// settled rows skip re-rendering while the transcript above them scrolls.
export const UserRow = memo(function UserRow(props: { node: UserNode; locale?: UiLocale; maxColumns?: number; selected?: boolean; expandedLevel?: 0 | 1 | 2; textSelection?: MessageTextRange }) {
  return (
    <MessageRail color={theme.accent} emphasis={props.selected === true} width={props.maxColumns}>
      <SelectableText color={theme.text} wrap="wrap" text={props.node.text} selection={props.textSelection} />
    </MessageRail>
  )
})
