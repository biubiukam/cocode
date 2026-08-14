import { Box, Text } from 'ink'
import type { TuiSnapshot } from '../../runtime/app.ts'
import { agentMark } from './agent-status.ts'
import { theme } from '../theme.ts'
import { text, type UiLocale } from '../../runtime/ui-locale.ts'

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
    telemetry.contextPercent === undefined
      ? undefined
      : text(props.locale, 'telemetryContext', {
          value: formatMetric(telemetry.contextPercent),
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
    hasContextSegments(telemetry)
      ? text(props.locale, 'telemetrySegments', {
          system: String(telemetry.contextSegments.system),
          prompt: String(telemetry.contextSegments.prompt),
          assistant: String(telemetry.contextSegments.assistant),
          thinking: String(telemetry.contextSegments.thinking),
          tools: String(telemetry.contextSegments.tools),
        })
      : undefined,
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
  ].filter((value): value is string => value !== undefined)
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box width="100%" justifyContent="space-between">
        <Text color={theme.dim}>
          {agentMark(props.agent)} {props.status.line}
        </Text>
        <Box>
          {props.status.tokens !== undefined ? (
            <Text color={theme.mute}>
              {text(props.locale, 'tokensIn')} {props.status.tokens.input} ·{' '}
              {text(props.locale, 'tokensOut')} {props.status.tokens.output}
            </Text>
          ) : null}
          {props.status.subagents !== undefined && props.status.subagents.running > 0 ? (
            <Text color={theme.info}>
              {' · '}
              {text(props.locale, 'subagentsRunning', {
                count: String(props.status.subagents.running),
              })}
            </Text>
          ) : props.status.subagents?.last?.event === 'finished' ? (
            <Text color={theme.mute}>
              {' · '}
              {text(props.locale, 'subagentFinished', {
                id: props.status.subagents.last.id,
              })}
            </Text>
          ) : null}
          {props.status.queueCount > 0 ? (
            <Text color={theme.info}>
              {' · '}
              {text(props.locale, 'queueCount', { count: String(props.status.queueCount) })}
            </Text>
          ) : null}
        </Box>
      </Box>
      {telemetryBits.length > 0 ? (
        <Text color={theme.mute}>{telemetryBits.join(' · ')}</Text>
      ) : null}
      {notice ? <Notice notice={notice} /> : null}
    </Box>
  )
}

function formatMetric(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function hasContextSegments(telemetry: TuiSnapshot['status']['telemetry']): boolean {
  return Object.values(telemetry.contextSegments).some((value) => value > 0)
}

function Notice(props: { notice: NonNullable<TuiSnapshot['notice']> }) {
  const color = props.notice.tone === 'error' ? theme.error : theme.info
  return <Text color={color}>! {props.notice.message}</Text>
}
