import { Box, Text } from 'ink'
import type { ReactNode } from 'react'
import type { TuiSnapshot } from '../../runtime/app.ts'
import { text, type UiLocale } from '../../runtime/ui-locale.ts'
import { theme } from '../theme.ts'

const INSPECTOR_WIDTH = 30

export { INSPECTOR_WIDTH }

export function Inspector(props: { snapshot: TuiSnapshot; locale: UiLocale }) {
  const { snapshot, locale } = props
  const telemetry = snapshot.status.telemetry
  const completedTodos = snapshot.status.todos.filter((todo) => todo.status === 'completed').length
  const hasActivity =
    snapshot.agent !== 'idle' ||
    telemetry.activity !== undefined ||
    snapshot.status.subagents?.running !== 0 ||
    snapshot.status.queueCount > 0
  const hasContext =
    snapshot.status.tokens !== undefined ||
    telemetry.contextPercent !== undefined ||
    telemetry.cacheHitRate !== undefined ||
    telemetry.tps !== undefined ||
    telemetry.reasoningEffort !== undefined
  const hasFiles = snapshot.composer.attachments.length > 0
  return (
    <Box
      width={INSPECTOR_WIDTH}
      flexShrink={0}
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.border}
      paddingX={1}
      marginLeft={1}
      minHeight={0}
    >
      <Text color={theme.brand} bold>
        {text(locale, 'inspector')}
      </Text>
      <Section title={text(locale, 'inspectorActivity')}>
        {hasActivity ? (
          <>
            <Line label="status" value={snapshot.status.line} color={theme.text} />
            {telemetry.activity !== undefined ? (
              <Line
                label={telemetry.activity.phase || 'activity'}
                value={telemetry.activity.line}
                color={theme.info}
              />
            ) : null}
            {snapshot.status.subagents?.running !== undefined &&
            snapshot.status.subagents.running > 0 ? (
              <Line
                label="agents"
                value={String(snapshot.status.subagents.running)}
                color={theme.info}
              />
            ) : null}
            {snapshot.status.queueCount > 0 ? (
              <Line
                label="queue"
                value={String(snapshot.status.queueCount)}
                color={theme.running}
              />
            ) : null}
          </>
        ) : (
          <Text color={theme.mute}>{text(locale, 'inspectorEmpty')}</Text>
        )}
      </Section>
      <Section title={text(locale, 'inspectorContext')}>
        {hasContext ? (
          <>
            {snapshot.status.tokens !== undefined ? (
              <Line
                label="tokens"
                value={`${snapshot.status.tokens.input} in · ${snapshot.status.tokens.output} out`}
              />
            ) : null}
            {telemetry.contextPercent !== undefined ? (
              <Line label="window" value={`${formatMetric(telemetry.contextPercent)}%`} />
            ) : null}
            {telemetry.cacheHitRate !== undefined ? (
              <Line label="cache" value={`${formatMetric(telemetry.cacheHitRate)}%`} />
            ) : null}
            {telemetry.tps !== undefined ? (
              <Line label="speed" value={`${formatMetric(telemetry.tps)} t/s`} />
            ) : null}
            {telemetry.reasoningEffort !== undefined ? (
              <Line label="reasoning" value={telemetry.reasoningEffort} />
            ) : null}
            <Text color={theme.mute} wrap="truncate-end">
              segments {formatSegments(telemetry.contextSegments)}
            </Text>
          </>
        ) : (
          <Text color={theme.mute}>{text(locale, 'inspectorEmpty')}</Text>
        )}
      </Section>
      <Section title={text(locale, 'inspectorFiles')}>
        <Line label="cwd" value={snapshot.header.cwd} />
        {hasFiles ? (
          snapshot.composer.attachments.map((path) => (
            <Text key={path} color={theme.text} wrap="truncate-start">
              @ {path}
            </Text>
          ))
        ) : (
          <Text color={theme.mute}>no attachments</Text>
        )}
      </Section>
      <Section title={text(locale, 'inspectorSession')}>
        <Line label="model" value={snapshot.header.model} />
        <Line label="id" value={snapshot.header.sessionId.slice(0, 8)} />
        {snapshot.status.sessionTitle !== undefined ? (
          <Line label="title" value={snapshot.status.sessionTitle} />
        ) : null}
        {snapshot.status.goal !== undefined ? (
          <>
            <Line label={text(locale, 'inspectorGoal')} value={snapshot.status.goal.phase} />
            <Text color={theme.text} wrap="truncate-end">
              {snapshot.status.goal.objective}
            </Text>
          </>
        ) : null}
        {snapshot.status.todos.length > 0 ? (
          <Line
            label={text(locale, 'inspectorTodos')}
            value={`${completedTodos}/${snapshot.status.todos.length}`}
          />
        ) : null}
        {snapshot.status.agentPreset !== undefined ? (
          <Line label="preset" value={snapshot.status.agentPreset} />
        ) : null}
      </Section>
    </Box>
  )
}

function Section(props: { title: string; children: ReactNode }) {
  return (
    <Box flexDirection="column" marginTop={1} minHeight={0}>
      <Text color={theme.accent} bold>
        {props.title}
      </Text>
      {props.children}
    </Box>
  )
}

function Line(props: { label: string; value: string; color?: string }) {
  return (
    <Text color={props.color ?? theme.dim} wrap="truncate-end">
      {props.label}: {props.value}
    </Text>
  )
}

function formatMetric(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function formatSegments(segments: TuiSnapshot['status']['telemetry']['contextSegments']): string {
  return `S${segments.system} P${segments.prompt} A${segments.assistant} T${segments.thinking} X${segments.tools}`
}
