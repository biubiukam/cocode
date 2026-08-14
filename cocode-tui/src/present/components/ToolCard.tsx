import { Box, Text } from 'ink'
import type { ToolNode } from '../../runtime/nodes/types.ts'
import { formatToolResult } from '../text-format.ts'
import { theme } from '../theme.ts'
import type { UiLocale } from '../../runtime/ui-locale.ts'

export function ToolCard(props: { node: ToolNode; verbose: boolean; locale: UiLocale }) {
  const { node, verbose } = props
  const mark = node.status === 'running' ? '…' : node.status === 'error' ? 'x' : 'ok'
  const color =
    node.status === 'error' ? theme.error : node.status === 'success' ? theme.success : theme.dim
  const state =
    node.status === 'running'
      ? props.locale === 'zh'
        ? '运行中'
        : 'running'
      : node.status === 'error'
      ? props.locale === 'zh'
        ? '失败'
        : 'error'
      : props.locale === 'zh'
      ? '完成'
      : 'done'
  const result = formatToolResult(node.result, verbose)
  const summary = !verbose ? result ?? node.error?.code : undefined
  return (
    <Box flexDirection="column" marginTop={1} paddingLeft={1}>
      <Text color={color}>
        {mark} <Text bold>{node.name}</Text> · {state}
        {summary ? ` · ${summary}` : ''}
      </Text>
      {verbose && node.args !== '' ? <Text color={theme.mute}> args {node.args}</Text> : null}
      {verbose && result !== undefined ? <Text color={theme.tool}> {result}</Text> : null}
      {verbose && node.error ? <Text color={theme.error}> {node.error.code}</Text> : null}
    </Box>
  )
}
