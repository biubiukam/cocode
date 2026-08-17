import { Box, Text } from 'ink'
import { memo } from 'react'
import type { ToolNode } from '../../runtime/nodes/types.ts'
import { formatToolResult } from '../text-format.ts'
import { BODY_INDENT, messageContentColumns } from '../layout.ts'
import { MessageRail } from './MessageRail.tsx'
import { theme } from '../theme.ts'
import { text, type UiLocale } from '../../runtime/ui-locale.ts'
import { extractPartialJsonStringArgument, truncatePlanProgress } from '../../runtime/nodes/tool-view.ts'
import { Markdown, StreamingMarkdown } from './Markdown.tsx'
import { joinToolSummary, projectToolSummary, toolErrorSummary } from '../tool-display.ts'
import type { MessageTextRange } from '../message-text-selection.ts'
import { SelectableText } from './SelectableText.tsx'
import { useAnimationTick } from '../use-spinner.ts'

// A running tool keeps re-rendering through its animation tick, so memoising
// here only skips cards whose call has already finished.
export const ToolCard = memo(function ToolCard(props: { node: ToolNode; verbose: boolean; locale: UiLocale; maxColumns?: number; selected?: boolean; attached?: boolean; textSelection?: MessageTextRange }) {
  const { node, verbose } = props
  useAnimationTick(node.status === 'running')
  const summary = projectToolSummary(node, props.locale, props.maxColumns ?? 120, Date.now())
  const contentColumns = messageContentColumns(props.maxColumns)
  const result = formatToolResult(node.result, verbose)
  const diffSummary = node.view?.kind === 'diff' ? node.view.summary : undefined
  const toolName = node.name.trim() === '' ? 'tool' : node.name
  const plan = toolName === 'exit_plan_mode' ? extractPartialJsonStringArgument(node.args, 'plan') : undefined
  const planProgress = plan === undefined ? undefined : truncatePlanProgress(plan)
  const isQuestionRunning = toolName === 'ask_user_question' && node.status === 'running'
  const questionProgress = isQuestionRunning ? extractPartialJsonStringArgument(node.args, 'question') : undefined
  return (
    // Same rail as the assistant reply that called this tool.
    <MessageRail color={props.selected === true || node.status === 'running' ? theme.accent : theme.mute} emphasis={props.selected === true} attached={props.attached === true} width={props.maxColumns}>
      <Box flexDirection="column" minWidth={0}>
        <Box height={1} overflowY="hidden">
          <SelectableText color={theme[summary.tone]} wrap="truncate-end" text={joinToolSummary(summary)} selection={props.textSelection} />
        </Box>
        {planProgress !== undefined ? (
          <Box flexDirection="column" paddingLeft={BODY_INDENT}>
            <Text color={theme.accent} wrap="truncate-end">
              {text(props.locale, node.streaming ? 'planStreaming' : 'planReady')}
            </Text>
            {node.streaming ? <StreamingMarkdown text={planProgress} maxColumns={contentColumns} selection={props.textSelection} /> : <Markdown text={planProgress} maxColumns={contentColumns} selection={props.textSelection} />}
          </Box>
        ) : null}
        {isQuestionRunning ? (
          <Box flexDirection="column" paddingLeft={BODY_INDENT}>
            <Text color={theme.accent} wrap="truncate-end">
              {text(props.locale, node.streaming ? 'questionStreaming' : 'questionReady')}
            </Text>
            {questionProgress === undefined ? null : (
              <Text color={theme.text} wrap="truncate-end">
                {questionProgress}
              </Text>
            )}
          </Box>
        ) : null}
        {verbose && node.args !== '' && planProgress === undefined && !isQuestionRunning ? <Text color={theme.mute}>args {node.args}</Text> : null}
        {verbose && diffSummary === undefined && result !== undefined ? <Text color={theme.dim}>{result}</Text> : null}
        {verbose && diffSummary !== undefined ? <DiffLines summary={diffSummary} /> : null}
        {verbose && node.error ? (
          <Text color={theme.danger} wrap="truncate-end">
            {toolErrorSummary(node.error) ?? node.error.code}
          </Text>
        ) : null}
      </Box>
    </MessageRail>
  )
})

function DiffLines(props: { summary: NonNullable<Extract<ToolNode['view'], { kind: 'diff' }>['summary']> }) {
  return (
    <Box flexDirection="column">
      {props.summary.files.slice(0, 8).map((file) => (
        <Box key={file.path} flexDirection="column">
          <Text color={theme.text}>{file.path}</Text>
          {file.lines.slice(0, 24).map((line, index) => (
            <Text key={`${file.path}:${index}`} color={line.kind === 'add' ? theme.success : line.kind === 'remove' ? theme.danger : theme.dim} wrap="truncate-end">
              {line.kind === 'add' ? '+' : line.kind === 'remove' ? '-' : ' '} {String(line.newLine ?? line.oldLine ?? '').padStart(4, ' ')} {line.text}
            </Text>
          ))}
          {file.truncated ? <Text color={theme.mute}>… diff lines folded</Text> : null}
        </Box>
      ))}
    </Box>
  )
}
