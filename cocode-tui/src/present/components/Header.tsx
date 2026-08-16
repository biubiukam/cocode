import { Box, Text } from 'ink'
import type { TuiSnapshot } from '../../runtime/app.ts'
import { workspaceName } from '../../runtime/workspace.ts'
import { theme } from '../theme.ts'
import { text, type UiLocale } from '../../runtime/ui-locale.ts'
import { compactColumns } from '../panel-layout.ts'

type HeaderData = Partial<TuiSnapshot['header']> & {
  sessionId: string
  cwd: string
  branch?: string
}

export function Header(props: {
  header: HeaderData
  locale: UiLocale
  columns?: number
  status?: Pick<TuiSnapshot['status'], 'tokens' | 'telemetry' | 'queueCount'>
}) {
  const { header } = props
  const session = header.sessionId.slice(0, 8)
  const workspace = workspaceName(header.cwd)
  const density = compactColumns(props.columns)
  const compact = density !== 'wide'
  const wide = density === 'wide'
  const model = header.model ?? ''
  const context = props.status?.telemetry.contextPercent
  const tokens = props.status?.tokens
  const meta = wide
    ? [
        model === '' ? undefined : `${header.provider ?? ''}/${model}`,
        context === undefined ? undefined : `ctx ${formatMetric(context)}%`,
        tokens === undefined ? undefined : `${tokens.input}/${tokens.output}`,
        props.status?.queueCount && props.status.queueCount > 0
          ? `queue ${props.status.queueCount}`
          : undefined,
      ].filter((value): value is string => value !== undefined && value !== '').join(' · ')
    : ''
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box width="100%" justifyContent="space-between">
        <Box gap={1} flexGrow={1} flexShrink={1} minWidth={0}>
          <Text color={theme.text} wrap="truncate-end">
            {workspace}
          </Text>
          {!compact && header.branch ? (
            <>
              <Text color={theme.mute}>·</Text>
              <Text color={theme.brand} wrap="truncate-end">
                #{header.branch}
              </Text>
            </>
          ) : null}
        </Box>
        <Box flexShrink={0}>
          {meta !== '' ? (
            <Text color={theme.dim} wrap="truncate-start">
              {meta} ·{' '}
            </Text>
          ) : null}
          <Text color={theme.mute} wrap="truncate-start">
            {text(props.locale, 'session')} {session}⌄
          </Text>
        </Box>
      </Box>
    </Box>
  )
}

function formatMetric(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}
