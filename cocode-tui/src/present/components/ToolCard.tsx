import { Box, Text } from 'ink'
import type { ToolNode } from '../../runtime/nodes/types.ts'
import { formatToolResult } from '../text-format.ts'
import { theme } from '../theme.ts'
import { text, type UiLocale } from '../../runtime/ui-locale.ts'
import {
  extractPartialJsonStringArgument,
  toolViewDetail,
  truncatePlanProgress,
} from '../../runtime/nodes/tool-view.ts'
import { formatDiffSummary } from '../../runtime/diff-summary.ts'
import { Markdown, StreamingMarkdown } from './Markdown.tsx'
import {
  formatElapsed,
  toolArgumentSummary,
  toolDisplayState,
  toolErrorSummary,
} from '../tool-display.ts'

export function ToolCard(props: {
  node: ToolNode
  verbose: boolean
  locale: UiLocale
  maxColumns?: number
}) {
  const { node, verbose } = props
  const displayState = toolDisplayState(node, props.locale)
  const elapsed = node.status === 'running' ? formatElapsed(node.time) : undefined
  const result = formatToolResult(node.result, verbose)
  const summary = !verbose ? result ?? toolErrorSummary(node.error) : undefined
  const detail = toolViewDetail(node.view)
  const argumentSummary = !verbose ? toolArgumentSummary(node.args) : undefined
  const diffSummary = node.view?.kind === 'diff' ? node.view.summary : undefined
  const toolName = node.name === '' ? 'tool' : node.name
  const plan =
    toolName === 'exit_plan_mode'
      ? extractPartialJsonStringArgument(node.args, 'plan')
      : undefined
  const planProgress = plan === undefined ? undefined : truncatePlanProgress(plan)
  const isQuestionRunning = toolName === 'ask_user_question' && node.status === 'running'
  const questionProgress = isQuestionRunning
    ? extractPartialJsonStringArgument(node.args, 'question')
    : undefined
  return (
    <Box
      flexDirection="column"
      marginTop={1}
      paddingLeft={3}
      width={props.maxColumns}
      minWidth={0}
    >
      <Text color={displayState.color}>
        <Text color={theme.mute}>↳ </Text>
        {displayState.mark} <Text bold>{toolName}</Text> · {displayState.label}
        {elapsed ? ` · ${elapsed}` : ''}
        {summary ? ` · ${summary}` : ''}
      </Text>
      {detail !== undefined ? <Text color={theme.mute}> {detail}</Text> : null}
      {argumentSummary !== undefined ? (
        <Text color={theme.dim} wrap="truncate-end">
          {' '}
          {argumentSummary}
        </Text>
      ) : null}
      {diffSummary !== undefined ? (
        <Text color={theme.info}> {formatDiffSummary(diffSummary)}</Text>
      ) : null}
      {planProgress !== undefined ? (
        <Box flexDirection="column" paddingLeft={2}>
          <Text color={theme.info} wrap="truncate-end">
            {text(props.locale, node.streaming ? 'planStreaming' : 'planReady')}
          </Text>
          {node.streaming ? (
            <StreamingMarkdown
              text={planProgress}
              maxColumns={props.maxColumns}
            />
          ) : (
            <Markdown
              text={planProgress}
              maxColumns={props.maxColumns}
            />
          )}
        </Box>
      ) : null}
      {isQuestionRunning ? (
        <Box flexDirection="column" paddingLeft={2}>
          <Text color={theme.info} wrap="truncate-end">
            {text(props.locale, node.streaming ? 'questionStreaming' : 'questionReady')}
          </Text>
          {questionProgress === undefined ? null : (
            <Text color={theme.text} wrap="truncate-end">
              {questionProgress}
            </Text>
          )}
        </Box>
      ) : null}
      {verbose && node.args !== '' && planProgress === undefined && !isQuestionRunning ? (
        <Text color={theme.mute}> args {node.args}</Text>
      ) : null}
      {verbose && diffSummary === undefined && result !== undefined ? (
        <Text color={theme.tool}> {result}</Text>
      ) : null}
      {verbose && diffSummary !== undefined ? (
        <DiffLines summary={diffSummary} />
      ) : null}
      {verbose && node.error ? (
        <Text color={theme.error} wrap="truncate-end">
          {' '}
          {toolErrorSummary(node.error) ?? node.error.code}
        </Text>
      ) : null}
    </Box>
  )
}

function DiffLines(props: {
  summary: NonNullable<Extract<ToolNode['view'], { kind: 'diff' }>['summary']>
}) {
  return (
    <Box flexDirection="column">
      {props.summary.files.slice(0, 8).map((file) => (
        <Box key={file.path} flexDirection="column">
          <Text color={theme.text}>{file.path}</Text>
          {file.lines.slice(0, 24).map((line, index) => (
            <Text
              key={`${file.path}:${index}`}
              color={
                line.kind === 'add'
                  ? theme.success
                  : line.kind === 'remove'
                  ? theme.error
                  : theme.dim
              }
              wrap="truncate-end"
            >
              {line.kind === 'add' ? '+' : line.kind === 'remove' ? '-' : ' '}{' '}
              {String(line.newLine ?? line.oldLine ?? '').padStart(4, ' ')} {line.text}
            </Text>
          ))}
          {file.truncated ? <Text color={theme.mute}>… diff lines folded</Text> : null}
        </Box>
      ))}
    </Box>
  )
}
