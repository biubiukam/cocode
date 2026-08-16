import { Box, Text } from 'ink'
import type { NoticeNode } from '../../runtime/nodes/types.ts'
import { theme } from '../theme.ts'

export function NoticeRow(props: { node: NoticeNode }) {
  const color = props.node.tone === 'error' ? theme.error : theme.info
  const mark = props.node.tone === 'error' ? '!' : 'i'
  return (
    <Box marginTop={1} paddingLeft={1}>
      <Text color={color}>
        <Text bold>{mark}</Text> {props.node.message}
      </Text>
    </Box>
  )
}
