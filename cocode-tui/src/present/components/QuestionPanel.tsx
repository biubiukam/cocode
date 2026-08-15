import { Box, Text, useInput } from 'ink'
import { useEffect, useRef, useState } from 'react'
import type { TuiQuestionSnapshot, TuiAction } from '../../runtime/app.ts'
import { text, type UiLocale } from '../../runtime/ui-locale.ts'
import { theme } from '../theme.ts'
import { isMouseInput, type TuiMousePointer } from '../mouse.ts'
import { questionCustomRow, questionOptionIndexAtRow } from '../mouse-hit.ts'

export function QuestionPanel(props: {
  state: TuiQuestionSnapshot
  locale: UiLocale
  panelStartRow: number
  mousePointer?: TuiMousePointer
  dispatch: (action: TuiAction) => void
}) {
  const options = props.state.question.options ?? []
  const [focus, setFocus] = useState(0)
  const [selected, setSelected] = useState<ReadonlySet<number>>(() => new Set())
  const [custom, setCustom] = useState('')
  const inputIndex = options.length
  const inputFocused = focus === inputIndex
  const multiSelect = props.state.question.multiSelect === true
  const lastPointerId = useRef<number>()

  useEffect(() => {
    const pointer = props.mousePointer
    if (pointer === undefined || pointer.id === lastPointerId.current) return
    lastPointerId.current = pointer.id
    const optionHasDescription = options.map((option) => option.description !== undefined)
    const firstOptionRow =
      props.panelStartRow + 4 + Number(props.state.question.detail !== undefined)
    const optionIndex = questionOptionIndexAtRow({
      row: pointer.row,
      firstOptionRow,
      optionHasDescription,
    })
    if (optionIndex !== undefined) {
      setFocus(optionIndex)
      if (pointer.action === 'move') return
      const option = options[optionIndex]
      if (option === undefined) return
      if (multiSelect) {
        setSelected((current) => {
          const next = new Set(current)
          if (next.has(optionIndex)) next.delete(optionIndex)
          else next.add(optionIndex)
          return next
        })
      } else {
        props.dispatch({ type: 'question.answer', selected: [option.label] })
      }
      return
    }
    if (pointer.row === questionCustomRow({ firstOptionRow, optionHasDescription })) {
      setFocus(inputIndex)
    }
  }, [inputIndex, multiSelect, options, props])

  useInput((input, key) => {
    if (isMouseInput(input)) return
    if (key.escape || (key.ctrl && input === 'c')) {
      props.dispatch({ type: 'question.cancel' })
      return
    }
    if (key.upArrow) {
      setFocus((current) => (current - 1 + options.length + 1) % (options.length + 1))
      return
    }
    if (key.downArrow || key.tab) {
      setFocus((current) => (current + 1) % (options.length + 1))
      return
    }
    if (!inputFocused && multiSelect && input === ' ') {
      setSelected((current) => {
        const next = new Set(current)
        if (next.has(focus)) next.delete(focus)
        else next.add(focus)
        return next
      })
      return
    }
    if (inputFocused && key.backspace) {
      setCustom((value) => value.slice(0, -1))
      return
    }
    if (inputFocused && input !== '' && !key.ctrl && !key.meta) {
      setCustom((value) => value + input)
      return
    }
    if (!key.return) return
    if (inputFocused || multiSelect) {
      const trimmedCustom = custom.trim()
      if (trimmedCustom === '' && selected.size === 0) return
      props.dispatch({
        type: 'question.answer',
        selected: [...selected]
          .sort((a, b) => a - b)
          .map((index) => options[index]?.label)
          .filter((label): label is string => label !== undefined),
        ...(trimmedCustom === '' ? {} : { custom: trimmedCustom }),
      })
      return
    }
    const option = options[focus]
    if (option === undefined) return
    props.dispatch({ type: 'question.answer', selected: [option.label] })
  })

  return (
    <Box
      flexDirection="column"
      marginTop={1}
      borderStyle="round"
      borderColor={theme.brand}
      paddingX={1}
    >
      <Text color={theme.brand} bold wrap="truncate-end">
        {props.state.question.header ?? text(props.locale, 'questionTitle')}{' '}
        <Text color={theme.mute}>
          · {props.state.position}/{props.state.total} · {text(props.locale, 'questionHint')} ·{' '}
          {props.locale === 'zh' ? '点击选项' : 'click an option'}
        </Text>
      </Text>
      <Text color={theme.text} wrap="truncate-end">
        {props.state.question.question}
      </Text>
      {props.state.question.detail !== undefined ? (
        <Text color={theme.dim} wrap="truncate-end">
          {props.state.question.detail}
        </Text>
      ) : null}
      {options.map((option, index) => {
        const active = focus === index
        const checked = multiSelect ? selected.has(index) : active
        return (
          <Box key={option.label} flexDirection="column">
            <Text color={active ? theme.text : theme.mute} inverse={active} wrap="truncate-end">
              {active ? '›' : ' '} {checked ? (multiSelect ? '◉' : '●') : '○'} {option.label}
            </Text>
            {option.description !== undefined ? (
              <Text color={theme.dim} wrap="truncate-end">
                {' '}
                {option.description}
              </Text>
            ) : null}
          </Box>
        )
      })}
      <Text
        color={inputFocused ? theme.text : theme.mute}
        inverse={inputFocused}
        wrap="truncate-end"
      >
        {inputFocused ? '›' : ' '} ✎ {custom === '' ? text(props.locale, 'questionCustom') : custom}
      </Text>
      <Text color={theme.dim} wrap="truncate-end">
        {multiSelect
          ? text(props.locale, 'questionMultiHint')
          : text(props.locale, 'questionSelectHint')}
      </Text>
    </Box>
  )
}
