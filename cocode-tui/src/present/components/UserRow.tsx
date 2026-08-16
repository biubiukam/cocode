import { Text } from 'ink'
import type { UserNode } from '../../runtime/nodes/types.ts'
import { theme } from '../theme.ts'
import type { UiLocale } from '../../runtime/ui-locale.ts'
import { MessageRail } from './MessageRail.tsx'

export function UserRow(props: {
  node: UserNode
  locale?: UiLocale
  maxColumns?: number
  selected?: boolean
  expandedLevel?: 0 | 1 | 2
}) {
  return (
    <MessageRail
      color={theme.accent}
      emphasis={props.selected === true}
      width={props.maxColumns}
    >
      <Text color={theme.text} wrap="wrap">
        {props.node.text}
      </Text>
    </MessageRail>
  )
}
