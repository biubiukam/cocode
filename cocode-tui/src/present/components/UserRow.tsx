import { Box, Text } from 'ink'
import type { UserNode } from '../../runtime/nodes/types.ts'
import { theme } from '../theme.ts'
import type { UiLocale } from '../../runtime/ui-locale.ts'

export function UserRow(props: { node: UserNode; locale?: UiLocale }) {
  return (
    <Box
      flexDirection="column"
      marginTop={1}
      borderStyle="single"
      borderTop={false}
      borderRight={false}
      borderBottom={false}
      borderColor={theme.accent}
      paddingLeft={1}
    >
      <Text color={theme.accent} bold>
        ◆ {props.locale === 'zh' ? '你' : 'you'}
      </Text>
      <Text color={theme.user}>{props.node.text}</Text>
    </Box>
  )
}
