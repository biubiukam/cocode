import { Box, Text } from 'ink'
import type { TuiSnapshot } from '../../runtime/app.ts'
import { workspaceName } from '../../runtime/workspace.ts'
import { theme } from '../theme.ts'

type HeaderData = TuiSnapshot['header'] & { branch?: string }

export function Header(props: { header: HeaderData }) {
  const { header } = props
  const session = header.sessionId.slice(0, 8)
  const workspace = workspaceName(header.cwd)
  return (
    <Box gap={1}>
      <Text color={theme.brand} bold>
        Cocode
      </Text>
      <Text color={theme.mute}>{session}</Text>
      <Text color={theme.dim}>
        {header.provider}/{header.model}
      </Text>
      <Text color={theme.mute}>{workspace}</Text>
      {header.branch ? <Text color={theme.dim}>{header.branch}</Text> : null}
    </Box>
  )
}
