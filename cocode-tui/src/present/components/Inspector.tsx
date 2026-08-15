import { Box, Text, useInput } from 'ink'
import { useCallback, useState, type ReactNode } from 'react'
import type { TuiSnapshot } from '../../runtime/app.ts'
import { text, type UiLocale } from '../../runtime/ui-locale.ts'
import { theme } from '../theme.ts'
import { ScrollablePanel, type ScrollMetrics } from './ScrollablePanel.tsx'

const INSPECTOR_WIDTH = 30

export { INSPECTOR_WIDTH }

export function Inspector(props: { snapshot: TuiSnapshot; locale: UiLocale; maxRows: number }) {
  const { snapshot, locale, maxRows } = props
  const [scrollOffset, setScrollOffset] = useState(0)
  const [scrollMetrics, setScrollMetrics] = useState<ScrollMetrics>({
    offset: 0,
    maxOffset: 0,
    viewportRows: 1,
    overflowing: false,
  })
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
  const updateScrollMetrics = useCallback((nextMetrics: ScrollMetrics) => {
    setScrollMetrics((currentMetrics) =>
      currentMetrics.offset === nextMetrics.offset &&
      currentMetrics.maxOffset === nextMetrics.maxOffset &&
      currentMetrics.viewportRows === nextMetrics.viewportRows &&
      currentMetrics.overflowing === nextMetrics.overflowing
        ? currentMetrics
        : nextMetrics,
    )
    setScrollOffset(nextMetrics.offset)
  }, [])

  useInput(
    (_input, key) => {
      if (!key.meta) return
      const direction = key.upArrow || key.pageUp ? -1 : key.downArrow || key.pageDown ? 1 : 0
      if (direction === 0) return
      const rows = key.pageUp || key.pageDown ? scrollMetrics.viewportRows : 1
      setScrollOffset((currentOffset) =>
        Math.max(0, Math.min(scrollMetrics.maxOffset, currentOffset + direction * rows)),
      )
    },
    { isActive: scrollMetrics.overflowing },
  )

  return (
    <Box
      width={INSPECTOR_WIDTH}
      height={maxRows}
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
      <ScrollablePanel
        height={Math.max(1, maxRows - 3)}
        scrollOffset={scrollOffset}
        onMetricsChange={updateScrollMetrics}
        upHint="Alt+↑"
        downHint="Alt+↓"
      >
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
          <>
            <Line
              label={text(locale, 'inspectorTodos')}
              value={`${completedTodos}/${snapshot.status.todos.length}`}
            />
          </>
        ) : null}
        {snapshot.status.agentPreset !== undefined ? (
          <Line label="preset" value={snapshot.status.agentPreset} />
        ) : null}
        </Section>
        <Section title={text(locale, 'inspectorRuntime')}>
        <Line
          label={text(locale, 'inspectorRuntimeName')}
          value={snapshot.runtimeInfo.name || text(locale, 'inspectorUnavailable')}
          color={snapshot.runtimeInfo.name === '' ? theme.mute : theme.text}
        />
        <Line
          label={text(locale, 'inspectorMcp')}
          value={
            snapshot.runtimeInfo.mcp.status === 'connected'
              ? `${text(locale, 'inspectorAvailable')} · ${snapshot.runtimeInfo.mcp.name ?? ''}`
              : snapshot.runtimeInfo.mcp.status === 'unknown'
              ? text(locale, 'inspectorNotReported')
              : text(locale, 'inspectorUnavailable')
          }
          color={snapshot.runtimeInfo.mcp.status === 'connected' ? theme.success : theme.mute}
        />
        <Line
          label={text(locale, 'inspectorCapabilitySource')}
          value={snapshot.runtimeInfo.capabilitySource}
        />
        </Section>
        <Section title={text(locale, 'inspectorSkills')}>
        <Line
          label={text(locale, 'inspectorLoadedSkill')}
          value={text(locale, 'inspectorNotReported')}
          color={theme.mute}
        />
        {snapshot.skills.length === 0 ? (
          <Text color={theme.mute}>{text(locale, 'inspectorNone')}</Text>
        ) : (
          <>
            <Line
              label={text(locale, 'inspectorAvailable')}
              value={String(snapshot.skills.length)}
              color={theme.success}
            />
            {snapshot.skills.slice(0, 3).map((skill) => (
              <Text key={skill.name} color={theme.text} wrap="truncate-end">
                <Text color={theme.success}>●</Text> /{skill.name}
              </Text>
            ))}
            {snapshot.skills.length > 3 ? (
              <Text color={theme.mute}>… +{snapshot.skills.length - 3}</Text>
            ) : null}
          </>
        )}
        </Section>
        <Section title={text(locale, 'inspectorCapabilities')}>
        {snapshot.runtimeInfo.capabilities.length === 0 ? (
          <Text color={theme.mute}>{text(locale, 'inspectorNone')}</Text>
        ) : (
          <>
            <Text color={theme.text} wrap="truncate-end">
              <Text color={theme.success}>●</Text> {text(locale, 'inspectorEnabled')}:{' '}
              {capabilityNames(snapshot.runtimeInfo.capabilities, true)}
            </Text>
            <Text color={theme.mute} wrap="truncate-end">
              <Text color={theme.mute}>○</Text> {text(locale, 'inspectorDisabled')}:{' '}
              {capabilityNames(snapshot.runtimeInfo.capabilities, false)}
            </Text>
          </>
        )}
        </Section>
        <Section title={text(locale, 'inspectorShortcuts')}>
          <Shortcut text={text(locale, 'footerScroll')} />
          <Shortcut text={text(locale, 'footerMessages')} />
          <Shortcut text={text(locale, 'footerMenu')} />
          <Shortcut text={text(locale, 'footerDetails')} />
          <Shortcut text="Alt+↑ / Alt+↓ inspector" />
        </Section>
      </ScrollablePanel>
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

function Shortcut(props: { text: string }) {
  return (
    <Text color={theme.mute} wrap="truncate-end">
      {props.text}
    </Text>
  )
}

function formatMetric(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function formatSegments(segments: TuiSnapshot['status']['telemetry']['contextSegments']): string {
  return `S${segments.system} P${segments.prompt} A${segments.assistant} T${segments.thinking} X${segments.tools}`
}

function capabilityNames(
  capabilities: TuiSnapshot['runtimeInfo']['capabilities'],
  enabled: boolean,
): string {
  const names = capabilities
    .filter((capability) => capability.enabled === enabled)
    .map((capability) => capability.name)
  return names.length === 0
    ? '—'
    : names.slice(0, 5).join(' ') + (names.length > 5 ? ` +${names.length - 5}` : '')
}
