import { Box, Text } from 'ink'
import type { TuiSnapshot } from '../../runtime/app.ts'
import { workspaceName } from '../../runtime/workspace.ts'
import { agentColor, agentMark } from './agent-status.ts'
import { theme } from '../theme.ts'

type HeaderData = TuiSnapshot['header'] & { branch?: string }

export function Header(props: { header: HeaderData; agent: TuiSnapshot['agent'] }) {
  const { header, agent } = props
  const session = header.sessionId.slice(0, 8)
  const workspace = workspaceName(header.cwd)
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box width="100%" justifyContent="space-between">
        <Box gap={1}>
          <Text color={theme.brand} bold>
            Cocode
          </Text>
          <Text color={theme.mute}>/</Text>
          <Text color={theme.text}>{workspace}</Text>
          {header.branch ? <Text color={theme.brand}>#{header.branch}</Text> : null}
        </Box>
        <Text color={theme.mute}>session {session}</Text>
      </Box>
      <Box gap={1}>
        <Text color={agentColor(agent)}>{agentMark(agent)}</Text>
        <Text color={theme.dim}>{header.provider}</Text>
        <Text color={theme.mute}>·</Text>
        <Text color={theme.dim}>{header.model}</Text>
        <Text color={theme.mute}>·</Text>
        <Text color={theme.mute}>interactive</Text>
      </Box>
    </Box>
  )
}
