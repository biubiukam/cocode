import { Text, useInput } from 'ink'
import { useEffect, useRef, useState } from 'react'
import type { TuiAction, TuiApprovalSnapshot } from '../../runtime/app.ts'
import { text, type UiLocale } from '../../runtime/ui-locale.ts'
import { theme } from '../theme.ts'
import { sanitizeSingleLine } from '../text-format.ts'
import { isMouseInput, type TuiMousePointer } from '../mouse.ts'
import { approvalActionAtRow } from '../mouse-hit.ts'
import { PanelFrame } from './PanelFrame.tsx'

export function ApprovalPanel(props: {
  state: TuiApprovalSnapshot
  locale: UiLocale
  panelStartRow: number
  mousePointer?: TuiMousePointer
  dispatch: (action: TuiAction) => void
}) {
  const [hoveredAction, setHoveredAction] = useState<ReturnType<typeof approvalActionAtRow>>()
  const [inputReady, setInputReady] = useState(false)
  const lastPointerId = useRef<number>()

  useEffect(() => {
    setInputReady(false)
    const timer = setTimeout(() => setInputReady(true), 700)
    return () => clearTimeout(timer)
  }, [props.state.request.callId, props.state.request.toolName])

  useEffect(() => {
    const pointer = props.mousePointer
    if (!inputReady || pointer === undefined || pointer.id === lastPointerId.current) return
    lastPointerId.current = pointer.id
    const action = approvalActionAtRow(pointer.row, props.panelStartRow)
    setHoveredAction(action)
    if (pointer.action === 'press' && action !== undefined) {
      props.dispatch({ type: 'approval.answer', outcome: action })
    }
  }, [inputReady, props])

  useInput((input, key) => {
    if (isMouseInput(input)) return
    if (!inputReady) return
    if (key.escape || (key.ctrl && input === 'c')) {
      props.dispatch({ type: 'approval.cancel' })
      return
    }
    if (input === 'a' || key.return) {
      props.dispatch({ type: 'approval.answer', outcome: 'allowed-once' })
      return
    }
    if (input === 't') {
      props.dispatch({ type: 'approval.answer', outcome: 'allowed-for-turn' })
      return
    }
    if (input === 'd' || input === 'n') {
      props.dispatch({ type: 'approval.answer', outcome: 'rejected' })
    }
  })

  const request = props.state.request
  return (
    <PanelFrame
      title={text(props.locale, 'approvalTitle')}
      footer={
        inputReady
          ? text(props.locale, 'approvalHint')
          : props.locale === 'zh'
          ? '请稍候…'
          : 'Please wait…'
      }
      borderColor={theme.accent}
    >
      <Text color={theme.text} wrap="truncate-end">
        {sanitizeSingleLine(request.toolName)}
      </Text>
      <Text color={theme.dim} wrap="truncate-end">
        {text(props.locale, 'approvalTarget')}:{' '}
        {sanitizeSingleLine(request.target ?? text(props.locale, 'approvalUnavailableValue'))}
      </Text>
      <Text color={theme.dim} wrap="truncate-end">
        {text(props.locale, 'approvalRisk')}:{' '}
        {sanitizeSingleLine(
          request.risk ?? request.reason ?? text(props.locale, 'approvalUnavailableValue'),
        )}
      </Text>
      <Text color={theme.dim} wrap="truncate-end">
        {text(props.locale, 'approvalSource')}: {sanitizeSingleLine(request.source ?? 'runtime')}
      </Text>
      <ApprovalAction
        active={hoveredAction === 'allowed-once'}
        label={props.locale === 'zh' ? '允许一次' : 'Allow once'}
        shortcut="a / enter"
      />
      <ApprovalAction
        active={hoveredAction === 'allowed-for-turn'}
        label={props.locale === 'zh' ? '本轮允许' : 'Allow for turn'}
        shortcut="t"
      />
      <ApprovalAction
        active={hoveredAction === 'rejected'}
        label={props.locale === 'zh' ? '拒绝' : 'Deny'}
        shortcut="d / n"
      />
    </PanelFrame>
  )
}

function ApprovalAction(props: { active: boolean; label: string; shortcut: string }) {
  return (
    <Text
      color={props.active ? theme.text : theme.mute}
      inverse={props.active}
      wrap="truncate-end"
    >
      {props.active ? '›' : ' '} {props.label} <Text color={theme.dim}>{props.shortcut}</Text>
    </Text>
  )
}
