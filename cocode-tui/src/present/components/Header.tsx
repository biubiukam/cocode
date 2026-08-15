import { Box, Text } from 'ink'
import type { TuiSnapshot } from '../../runtime/app.ts'
import { workspaceName } from '../../runtime/workspace.ts'
import { theme } from '../theme.ts'
import { text, type UiLocale } from '../../runtime/ui-locale.ts'

type HeaderData = TuiSnapshot['header'] & { branch?: string }

export function Header(props: {
  header: HeaderData
  locale: UiLocale
  columns?: number
}) {
  const { header } = props
  const session = header.sessionId.slice(0, 8)
  const workspace = workspaceName(header.cwd)
  const compact = props.columns !== undefined && props.columns < 84
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
        <Text color={theme.mute} wrap="truncate-start">
          {text(props.locale, 'session')} {session}⌄
        </Text>
      </Box>
    </Box>
  )
}
