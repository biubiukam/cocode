import { Box, Text } from 'ink'
import type { ToolNode } from '../../runtime/nodes/types.ts'
import { formatToolResult } from '../text-format.ts'
import { theme } from '../theme.ts'

export function ToolCard(props: { node: ToolNode; verbose: boolean }) {
  const { node, verbose } = props
  const mark = node.status === 'running' ? '…' : node.status === 'error' ? 'x' : 'ok'
  const color =
    node.status === 'error' ? theme.error : node.status === 'success' ? theme.success : theme.dim
  const result = formatToolResult(node.result, verbose)
  const summary = !verbose ? result ?? node.error?.code : undefined
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color={color}>
        {mark} {node.name}
        {summary ? ` · ${summary}` : ''}
      </Text>
      {verbose && node.args !== '' ? <Text color={theme.mute}>{node.args}</Text> : null}
      {verbose && result !== undefined ? <Text color={theme.tool}>{result}</Text> : null}
      {verbose && node.error ? <Text color={theme.error}>{node.error.code}</Text> : null}
    </Box>
  )
}
