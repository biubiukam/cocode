import { Box, Text } from 'ink'
import type { TuiSnapshot } from '../../runtime/app.ts'
import { AgentStatusIndicator } from './AgentStatusIndicator.tsx'
import { theme } from '../theme.ts'
import { text, type UiLocale } from '../../runtime/ui-locale.ts'
import stringWidth from 'string-width'

export function noticeLines(message: string): string[] {
  return message.split('\n')
}

export function noticeRows(message: string, maxColumns = 80): number {
  const columns = Math.max(1, Math.trunc(maxColumns))
  return noticeLines(message).reduce((rows, line) => {
    return rows + Math.max(1, Math.ceil((2 + stringWidth(line)) / columns))
  }, 0)
}

export function StatusLine(props: {
  status: TuiSnapshot['status']
  agent: TuiSnapshot['agent']
  notice?: TuiSnapshot['notice']
  locale: UiLocale
}) {
  const notice = props.notice
  const telemetry = props.status.telemetry
  const telemetryBits = [
    telemetry.tps === undefined
      ? undefined
      : text(props.locale, 'telemetryTps', { value: formatMetric(telemetry.tps) }),
    telemetry.cacheHitRate === undefined
      ? undefined
      : text(props.locale, 'telemetryCache', {
          value: formatMetric(telemetry.cacheHitRate),
        }),
    telemetry.reasoningEffort === undefined
      ? undefined
      : text(props.locale, 'telemetryReasoning', { value: telemetry.reasoningEffort }),
    telemetry.activity === undefined
      ? undefined
      : text(props.locale, 'telemetryActivity', {
          phase: telemetry.activity.phase,
          line: telemetry.activity.line,
        }),
    props.status.todos.length > 0
      ? text(props.locale, 'todoProgress', {
          done: String(props.status.todos.filter((todo) => todo.status === 'completed').length),
          total: String(props.status.todos.length),
        })
      : undefined,
    props.status.goal === undefined
      ? undefined
      : text(props.locale, 'goalPhase', { phase: props.status.goal.phase }),
    props.status.agentPreset === undefined
      ? undefined
      : text(props.locale, 'agentPreset', { name: props.status.agentPreset }),
    props.status.transcript === undefined
      ? undefined
      : text(props.locale, 'transcriptTrimmed', {
          count: String(props.status.transcript.evicted),
        }),
  ].filter((value): value is string => value !== undefined)
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box width="100%" justifyContent="space-between">
        <Text color={theme.dim} wrap="truncate-end">
          <AgentStatusIndicator agent={props.agent} /> {props.status.line}
        </Text>
        <Box flexShrink={0}>
          {props.status.focusMode ? (
            <Text color={theme.info} wrap="truncate-end">
              {text(props.locale, 'focusStatusOn')}
            </Text>
          ) : null}
          {props.status.tokens !== undefined ? (
            <Text color={theme.mute} wrap="truncate-end">
              {props.status.focusMode ? ' · ' : null}
              {text(props.locale, 'tokensIn')} {props.status.tokens.input} ·{' '}
              {text(props.locale, 'tokensOut')} {props.status.tokens.output}
            </Text>
          ) : null}
          {props.status.subagents !== undefined && props.status.subagents.running > 0 ? (
            <Text color={theme.info} wrap="truncate-end">
              {' · '}
              {text(props.locale, 'subagentsRunning', {
                count: String(props.status.subagents.running),
              })}
            </Text>
          ) : props.status.subagents?.last?.event === 'finished' ? (
            <Text color={theme.mute} wrap="truncate-end">
              {' · '}
              {text(props.locale, 'subagentFinished', {
                id: props.status.subagents.last.id,
              })}
            </Text>
          ) : null}
          {props.status.queueCount > 0 ? (
            <Text color={theme.info} wrap="truncate-end">
              {' · '}
              {text(props.locale, 'queueCount', { count: String(props.status.queueCount) })}
            </Text>
          ) : null}
        </Box>
      </Box>
      {telemetryBits.length > 0 ? (
        <Text color={theme.mute} wrap="truncate-end">
          {telemetryBits.join(' · ')}
        </Text>
      ) : null}
      {notice ? <Notice notice={notice} /> : null}
    </Box>
  )
}

function formatMetric(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function Notice(props: {
  notice: NonNullable<TuiSnapshot['notice']>
}) {
  const color = props.notice.tone === 'error' ? theme.error : theme.info
  const mark = props.notice.tone === 'error' ? '!' : '·'
  return (
    <Box flexDirection="column">
      {noticeLines(props.notice.message).map((line, index) => (
        <Text key={`${String(index)}:${line}`} color={color}>
          {index === 0 ? `${mark} ` : '  '}{line}
        </Text>
      ))}
    </Box>
  )
}
