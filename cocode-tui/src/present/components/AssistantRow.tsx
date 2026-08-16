import { Box, Text } from 'ink'
import type { AssistantNode } from '../../runtime/nodes/types.ts'
import { Markdown, StreamingMarkdown } from './Markdown.tsx'
import { formatReasoning } from '../text-format.ts'
import { theme } from '../theme.ts'
import type { UiLocale } from '../../runtime/ui-locale.ts'

export function AssistantRow(props: {
  node: AssistantNode
  verbose: boolean
  locale: UiLocale
  maxColumns?: number
}) {
  const { node, verbose } = props
  const markdownColumns =
    props.maxColumns === undefined ? undefined : Math.max(1, props.maxColumns - 3)
  const reasoning = formatReasoning(node.reasoning, verbose, node.streaming)
  return (
    <Box
      flexDirection="column"
      marginTop={1}
      paddingLeft={1}
      width={props.maxColumns}
      minWidth={0}
    >
      <Text color={theme.info} bold>
        ● cocode
      </Text>
      {reasoning !== undefined ? (
        <Text color={theme.mute} wrap="wrap">
          {' '}
          {reasoning}
        </Text>
      ) : null}
      {node.text !== '' ? (
        <Box flexDirection="column" paddingLeft={2}>
          {node.streaming ? (
            <StreamingMarkdown text={node.text} maxColumns={markdownColumns} />
          ) : (
            <Markdown text={node.text} maxColumns={markdownColumns} />
          )}
        </Box>
      ) : null}
    </Box>
  )
}
