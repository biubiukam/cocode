import { Box, Text } from 'ink'
import type { UserNode } from '../../runtime/nodes/types.ts'
import { theme } from '../theme.ts'
import { text, type UiLocale } from '../../runtime/ui-locale.ts'

export function UserRow(props: { node: UserNode; locale: UiLocale }) {
  return (
    <Box flexDirection="column" marginTop={1} paddingLeft={1}>
      <Text color={theme.brand} bold>
        {props.locale === 'zh' ? '你' : 'you'}{' '}
        <Text color={theme.mute}>· {text(props.locale, 'prompt')}</Text>
      </Text>
      <Text color={theme.user}> {props.node.text}</Text>
    </Box>
  )
}
