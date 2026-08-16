import { Box, Text } from 'ink'
import type { AssistantNode } from '../../runtime/nodes/types.ts'
import { Markdown, StreamingMarkdown } from './Markdown.tsx'
import { MessageRail } from './MessageRail.tsx'
import { formatReasoning } from '../text-format.ts'
import { glyphs } from '../glyphs.ts'
import { messageContentColumns } from '../layout.ts'
import { theme } from '../theme.ts'
import { useSpinnerFrame } from '../use-spinner.ts'
import { text, type UiLocale } from '../../runtime/ui-locale.ts'

export function AssistantRow(props: {
  node: AssistantNode
  verbose: boolean
  locale: UiLocale
  maxColumns?: number
  selected?: boolean
  expandedLevel?: 0 | 1 | 2
}) {
  const { node, verbose } = props
  const contentColumns = messageContentColumns(props.maxColumns)
  const reasoning = formatReasoning(
    node.reasoning,
    verbose,
    node.streaming && node.thinking !== false,
    node.thinkingDurationMs,
    props.expandedLevel ?? (verbose ? 2 : 0),
  )
  const thinkingActive = node.streaming && node.thinking !== false && node.text === ''
  const spinner = useSpinnerFrame(glyphs.spinner, thinkingActive)
  // The rail is the only always-visible signal that a reply is still arriving,
  // so streaming tints the line rather than adding a row of metadata.
  const railColor = props.selected === true || node.streaming ? theme.accent : theme.mute
  return (
    <MessageRail
      color={railColor}
      emphasis={props.selected === true}
      width={props.maxColumns}
    >
      {reasoning !== undefined ? (
        <Text color={theme.mute} wrap="wrap">
          {thinkingActive ? `${spinner} ` : ''}
          {reasoning}
        </Text>
      ) : thinkingActive ? (
        <Text color={theme.accent}>
          {spinner} {text(props.locale, 'agentThinking')}
        </Text>
      ) : null}
      {node.text !== '' ? (
        <Box flexDirection="column">
          {node.streaming ? (
            <StreamingMarkdown text={node.text} maxColumns={contentColumns} />
          ) : (
            <Markdown text={node.text} maxColumns={contentColumns} />
          )}
        </Box>
      ) : null}
    </MessageRail>
  )
}
