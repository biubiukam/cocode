import { Box, Text } from 'ink'
import type { AssistantNode } from '../../runtime/nodes/types.ts'
import { Markdown, StreamingMarkdown } from './Markdown.tsx'
import { formatReasoning } from '../text-format.ts'
import { theme } from '../theme.ts'
import { text, type UiLocale } from '../../runtime/ui-locale.ts'

export function AssistantRow(props: { node: AssistantNode; verbose: boolean; locale: UiLocale }) {
  const { node, verbose } = props
  const reasoning = formatReasoning(node.reasoning, verbose, node.streaming)
  return (
    <Box flexDirection="column" marginTop={1} paddingLeft={1}>
      <Text color={theme.info} bold>
        cocode{' '}
        <Text color={theme.mute}>
          ·{' '}
          {node.streaming
            ? text(props.locale, 'agentRunning')
            : props.locale === 'zh'
            ? '回答'
            : 'answer'}
        </Text>
      </Text>
      {reasoning !== undefined ? <Text color={theme.mute}> {reasoning}</Text> : null}
      {node.text !== '' ? (
        node.streaming ? (
          <StreamingMarkdown text={node.text} />
        ) : (
          <Markdown text={node.text} />
        )
      ) : null}
    </Box>
  )
}
