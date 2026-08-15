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

export function ToolCard(props: {
  node: ToolNode
  verbose: boolean
  locale: UiLocale
  maxColumns?: number
}) {
  const { node, verbose } = props
  const mark = node.status === 'running' ? '◌' : node.status === 'error' ? '×' : '✓'
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
  const detail = toolViewDetail(node.view)
  const diffSummary = node.view?.kind === 'diff' ? node.view.summary : undefined
  const toolName = node.name === '' ? 'tool' : node.name
  const plan =
    toolName === 'exit_plan_mode'
      ? extractPartialJsonStringArgument(node.args, 'plan')
      : undefined
  const planProgress = plan === undefined ? undefined : truncatePlanProgress(plan)
  return (
    <Box
      flexDirection="column"
      marginTop={1}
      paddingLeft={3}
      width={props.maxColumns}
      minWidth={0}
    >
      <Text color={color}>
        <Text color={theme.mute}>↳ </Text>
        {mark} <Text bold>{toolName}</Text> · {state}
        {summary ? ` · ${summary}` : ''}
      </Text>
      {detail !== undefined ? <Text color={theme.mute}> {detail}</Text> : null}
      {diffSummary !== undefined ? (
        <Text color={theme.info}> {formatDiffSummary(diffSummary)}</Text>
      ) : null}
      {planProgress !== undefined ? (
        <Box flexDirection="column" paddingLeft={2}>
          <Text color={theme.info} wrap="truncate-end">
            {text(props.locale, node.streaming ? 'planStreaming' : 'planReady')}
          </Text>
          {node.streaming ? (
            <StreamingMarkdown text={planProgress} maxColumns={props.maxColumns} />
          ) : (
            <Markdown text={planProgress} maxColumns={props.maxColumns} />
          )}
        </Box>
      ) : null}
      {verbose && node.args !== '' && planProgress === undefined ? (
        <Text color={theme.mute}> args {node.args}</Text>
      ) : null}
      {verbose && diffSummary === undefined && result !== undefined ? (
        <Text color={theme.tool}> {result}</Text>
      ) : null}
      {verbose && diffSummary !== undefined ? <DiffLines summary={diffSummary} /> : null}
      {verbose && node.error ? <Text color={theme.error}> {node.error.code}</Text> : null}
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
