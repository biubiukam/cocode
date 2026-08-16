/**
 * First-run fork: paste a key or log in. Types only, no agency client.
 */

import { Box, Text, useInput, useStdout } from 'ink'
import { useState } from 'react'
import type { AuthAction, AuthSnapshot } from '../runtime/auth/types.ts'
import { cycleGateOption, GATE_OPTIONS } from './auth-options.ts'
import { theme } from './theme.ts'
import { WhaleLogo } from './components/WhaleLogo.tsx'
import { isMouseInput } from './mouse.ts'
import { terminalViewport } from './terminal-output.ts'
import { HORIZONTAL_WHALE_MIN_COLUMNS } from './whale-animation.ts'

export function AuthGate(props: {
  snapshot: AuthSnapshot
  dispatch: (action: AuthAction) => void
  onQuit: () => void
}) {
  const { snapshot, dispatch, onQuit } = props
  const [draft, setDraft] = useState('')
  const [focused, setFocused] = useState(0)
  const { stdout } = useStdout()
  const { columns: terminalColumns } = terminalViewport(stdout)
  const picking = snapshot.phase === 'gate' || snapshot.phase === 'failed'
  const logoSize =
    terminalColumns < HORIZONTAL_WHALE_MIN_COLUMNS
      ? 'inline'
      : terminalColumns < 72
        ? 'medium'
        : 'large'

  useInput((input, key) => {
    if (isMouseInput(input)) return
    if (key.escape || (key.ctrl && input === 'c')) {
      if (snapshot.phase === 'gate') {
        onQuit()
        return
      }
      setDraft('')
      dispatch({ type: 'cancel' })
      return
    }

    if (snapshot.phase === 'byok') {
      if (key.return) {
        dispatch({
          type: 'submitByok',
          provider: 'deepseek-official',
          key: draft,
        })
        setDraft('')
        return
      }
      if (key.backspace || key.delete) {
        setDraft((value) => value.slice(0, -1))
        return
      }
      if (input !== '') setDraft((value) => value + input)
      return
    }

    if (!picking) return

    if (key.upArrow) {
      setFocused((index) => cycleGateOption(index, -1))
      return
    }
    if (key.downArrow) {
      setFocused((index) => cycleGateOption(index, 1))
      return
    }
    if (key.return) {
      choose(GATE_OPTIONS[focused] ?? 'byok')
      return
    }
    if (input === '1') {
      setFocused(0)
      choose('byok')
      return
    }
    if (input === '2') {
      setFocused(1)
      choose('cocode')
    }
  })

  function choose(option: (typeof GATE_OPTIONS)[number]): void {
    setDraft('')
    if (option === 'byok') dispatch({ type: 'chooseByok' })
    else dispatch({ type: 'chooseCocode' })
  }

  return (
    <Box flexDirection="column" padding={1}>
      <WhaleLogo size={logoSize} />
      <Box marginTop={1} gap={1}>
        <Text color={theme.accent} bold>
          cocode
        </Text>
        <Text color={theme.mute}>terminal agent</Text>
      </Box>
      <Box marginTop={1}>
        <Text color={theme.text}>用自己的 Key，或登录 Cocode 账号。</Text>
      </Box>
      {picking ? (
        <Box marginTop={1} flexDirection="column">
          <GateRow focused={focused === 0} label="粘贴 API Key" hint="1" />
          <GateRow focused={focused === 1} label="登录 Cocode" hint="2" />
        </Box>
      ) : null}
      {snapshot.phase === 'byok' ? (
        <Box marginTop={1} flexDirection="column">
          <Text color={theme.mute}>粘贴 DeepSeek API Key，只保存在这台电脑上。</Text>
          <Text color={theme.text}>
            {'> '}
            {draft === '' ? '' : '*'.repeat(draft.length)}
          </Text>
        </Box>
      ) : null}
      {snapshot.phase === 'device' && snapshot.device !== undefined ? (
        <Box marginTop={1} flexDirection="column">
          <Text color={theme.text}>请在浏览器里确认这串代码：</Text>
          <Text color={theme.accent} bold>
            {snapshot.device.userCode}
          </Text>
          <Text color={theme.mute}>{snapshot.device.verificationUriComplete}</Text>
          <Text color={theme.mute}>等待确认… esc 取消</Text>
        </Box>
      ) : null}
      {snapshot.phase === 'busy' ? (
        <Box marginTop={1}>
          <Text color={theme.mute}>处理中…</Text>
        </Box>
      ) : null}
      {snapshot.error !== undefined ? (
        <Box marginTop={1}>
          <Text color={theme.danger}>{snapshot.error}</Text>
        </Box>
      ) : null}
      <Box marginTop={1}>
        <Text color={theme.mute}>{picking ? '↑↓ 选择 · enter 确认 · esc 退出' : 'esc 返回'}</Text>
      </Box>
    </Box>
  )
}

function GateRow(props: { focused: boolean; label: string; hint: string }) {
  const color = props.focused ? theme.accent : theme.dim
  const mark = props.focused ? '>' : ' '
  return (
    <Text color={color} bold={props.focused}>
      {mark} [{props.hint}] {props.label}
    </Text>
  )
}
