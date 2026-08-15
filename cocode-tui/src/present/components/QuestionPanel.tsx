import { Box, Text, useInput } from 'ink'
import { useEffect, useRef, useState } from 'react'
import type { TuiQuestionSnapshot, TuiAction } from '../../runtime/app.ts'
import { text, type UiLocale } from '../../runtime/ui-locale.ts'
import { theme } from '../theme.ts'
import { isMouseInput, type TuiMousePointer } from '../mouse.ts'
import { questionCustomRow, questionOptionIndexAtRow } from '../mouse-hit.ts'
import { PanelFrame } from './PanelFrame.tsx'

export function QuestionPanel(props: {
  state: TuiQuestionSnapshot
  locale: UiLocale
  panelStartRow: number
  mousePointer?: TuiMousePointer
  dispatch: (action: TuiAction) => void
}) {
  const options = props.state.question.options ?? []
  const inputIndex = options.length
  const multiSelect = props.state.question.multiSelect === true
  const savedAnswer = props.state.answer
  const savedSelected = new Set(
    (savedAnswer?.selected ?? [])
      .map((label) => options.findIndex((option) => option.label === label))
      .filter((index) => index >= 0),
  )
  const [focus, setFocus] = useState(() => {
    const selectedIndex = [...savedSelected][0]
    if (selectedIndex !== undefined) return selectedIndex
    return savedAnswer?.custom === undefined ? 0 : inputIndex
  })
  const [selected, setSelected] = useState<ReadonlySet<number>>(() => savedSelected)
  const [custom, setCustom] = useState(() => savedAnswer?.custom ?? '')
  const [dirty, setDirty] = useState(false)
  const inputFocused = focus === inputIndex
  const customLines = custom.split('\n')
  const visibleCustomLines = customLines.slice(-3)
  const lastPointerId = useRef<number>()

  useEffect(() => {
    const selectedIndex = [...savedSelected][0]
    setFocus(selectedIndex ?? (savedAnswer?.custom === undefined ? 0 : inputIndex))
    setSelected(savedSelected)
    setCustom(savedAnswer?.custom ?? '')
    setDirty(false)
  }, [inputIndex, props.state.key])

  useEffect(() => {
    const pointer = props.mousePointer
    if (pointer === undefined || pointer.id === lastPointerId.current) return
    lastPointerId.current = pointer.id
    const optionHasDescription = options.map((option) => option.description !== undefined)
    const firstOptionRow =
      props.panelStartRow + 6 + Number(props.state.question.detail !== undefined)
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
        setDirty(true)
      } else {
        setSelected(new Set([optionIndex]))
        setDirty(true)
      }
      return
    }
    const customRow = questionCustomRow({ firstOptionRow, optionHasDescription })
    if (pointer.row >= customRow && pointer.row <= customRow + 2) {
      setFocus(inputIndex)
    }
  }, [inputIndex, multiSelect, options, props])

  useInput((input, key) => {
    if (isMouseInput(input)) return
    if (key.escape || (key.ctrl && input === 'c')) {
      props.dispatch({ type: 'question.cancel' })
      return
    }
    if (key.leftArrow || key.rightArrow) {
      props.dispatch({
        type: 'question.navigate',
        direction: key.leftArrow ? 'previous' : 'next',
        selected: [...selected]
          .sort((a, b) => a - b)
          .map((index) => options[index]?.label)
          .filter((label): label is string => label !== undefined),
        ...(custom.trim() === '' ? {} : { custom: custom.trim() }),
        dirty,
      })
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
      setDirty(true)
      return
    }
    if (inputFocused && (key.backspace || key.delete)) {
      setCustom((value) => value.slice(0, -1))
      setDirty(true)
      return
    }
    if (inputFocused && key.return && key.shift) {
      setCustom((value) => `${value}\n`)
      setDirty(true)
      return
    }
    if (key.return) {
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
      return
    }
    if (inputFocused && input !== '' && !key.ctrl && !key.meta) {
      setCustom((value) => value + input)
      setDirty(true)
    }
  })

  return (
    <PanelFrame
      title={text(props.locale, 'questionTitle')}
      hint={`${props.state.position}/${props.state.total} · ${text(props.locale, 'questionHint')}`}
      borderColor={theme.brand}
      footer={
        [
          text(props.locale, 'questionPrevious'),
          text(props.locale, 'questionNext'),
          text(props.locale, 'questionSubmit'),
          text(props.locale, 'questionNewline'),
          text(props.locale, 'questionExit'),
          multiSelect
            ? text(props.locale, 'questionMultiHint')
            : text(props.locale, 'questionSelectHint'),
        ].join(' · ')
      }
    >
      <Box flexDirection="row" gap={1}>
        {Array.from({ length: props.state.total }, (_, index) => {
          const position = index + 1
          const active = position === props.state.position
          return (
            <Text key={position} color={active ? theme.text : theme.mute} inverse={active}>
              ?{position}
            </Text>
          )
        })}
        <Text color={theme.dim} wrap="truncate-end">
          {props.state.question.header ?? `${props.state.position}/${props.state.total}`}
        </Text>
      </Box>
      <Box flexDirection="row">
        <Text backgroundColor={theme.brand} color={theme.text} bold>
          {' ? '}
        </Text>
        <Text color={theme.text} bold wrap="truncate-end">
          {' '}{props.state.question.question}
        </Text>
      </Box>
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
      <Box flexDirection="column" marginTop={1}>
        <Text color={inputFocused ? theme.accent : theme.dim}>
          {inputFocused ? '│' : ' '} ✎ {text(props.locale, 'questionCustom')}
        </Text>
        {visibleCustomLines.map((line, index) => (
          <Text
            key={`${index}-${line}`}
            color={inputFocused ? theme.text : theme.mute}
            inverse={inputFocused && index === visibleCustomLines.length - 1}
            wrap="truncate-end"
          >
            {inputFocused ? '│ ' : '  '}{line === '' && custom === '' ? text(props.locale, 'questionCustom') : line}
          </Text>
        ))}
      </Box>
    </PanelFrame>
  )
}
