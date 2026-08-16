import { Box, Text } from 'ink'
import { useEffect, useState } from 'react'
import type { AssistantNode } from '../../runtime/nodes/types.ts'
import { Markdown, StreamingMarkdown } from './Markdown.tsx'
import { formatReasoning } from '../text-format.ts'
import { theme } from '../theme.ts'
import type { UiLocale } from '../../runtime/ui-locale.ts'
import { assistantContentColumns } from '../assistant-layout.ts'

export function AssistantRow(props: {
  node: AssistantNode
  verbose: boolean
  locale: UiLocale
  maxColumns?: number
  selected?: boolean
  expandedLevel?: 0 | 1 | 2
}) {
  const { node, verbose } = props
  const markdownColumns = assistantContentColumns(props.maxColumns)
  const reasoning = formatReasoning(
    node.reasoning,
    verbose,
    node.streaming && node.thinking !== false,
    node.thinkingDurationMs,
    props.expandedLevel ?? (verbose ? 2 : 0),
  )
  const thinkingActive = node.streaming && node.thinking !== false && node.text === ''
  const [frame, setFrame] = useState(0)

  useEffect(() => {
    setFrame(0)
    if (!thinkingActive) return
    const timer = setInterval(() => setFrame((current) => (current + 1) % 4), 140)
    return () => clearInterval(timer)
  }, [thinkingActive])
  return (
    <Box
      flexDirection="row"
      marginTop={1}
      width={props.maxColumns}
      minWidth={0}
    >
      <Text color={props.selected ? theme.success : theme.mute}>
        {props.selected ? '▌' : ' '}
      </Text>
      <Box
        flexDirection="column"
        paddingLeft={1}
        minWidth={0}
        width={assistantContentColumns(props.maxColumns)}
      >
        {reasoning !== undefined ? (
          <Text color={theme.mute} wrap="wrap">
            {thinkingActive ? `${['◐', '◓', '◑', '◒'][frame] ?? '◐'} ` : ''}
            {reasoning}
          </Text>
        ) : thinkingActive ? (
          <Text color={theme.running}>{['◐', '◓', '◑', '◒'][frame] ?? '◐'} thinking…</Text>
        ) : null}
        {node.text !== '' ? (
          <Box flexDirection="column">
            {node.streaming ? (
              <StreamingMarkdown text={node.text} maxColumns={markdownColumns} />
            ) : (
              <Markdown text={node.text} maxColumns={markdownColumns} />
            )}
          </Box>
        ) : null}
      </Box>
    </Box>
  )
}
