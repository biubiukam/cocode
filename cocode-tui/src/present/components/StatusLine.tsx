import { Box, Text } from 'ink'
import type { TuiSnapshot } from '../../runtime/app.ts'
import { agentMark } from './agent-status.ts'
import { theme } from '../theme.ts'

export function StatusLine(props: {
  status: TuiSnapshot['status']
  agent: TuiSnapshot['agent']
  notice?: TuiSnapshot['notice']
}) {
  const notice = props.notice
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box width="100%" justifyContent="space-between">
        <Text color={theme.dim}>
          {agentMark(props.agent)} {props.status.line}
        </Text>
        {props.status.tokens !== undefined ? (
          <Text color={theme.mute}>
            tokens in {props.status.tokens.input} · out {props.status.tokens.output}
          </Text>
        ) : null}
      </Box>
      {notice ? <Notice notice={notice} /> : null}
    </Box>
  )
}

function Notice(props: { notice: NonNullable<TuiSnapshot['notice']> }) {
  const color = props.notice.tone === 'error' ? theme.error : theme.info
  return <Text color={color}>! {props.notice.message}</Text>
}
