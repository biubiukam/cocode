import { Box, Text, useInput } from 'ink'
import { useState } from 'react'
import { text, type UiLocale } from '../../runtime/ui-locale.ts'
import { isMouseInput } from '../mouse.ts'
import { PANEL_BORDER } from '../layout.ts'
import { theme } from '../theme.ts'

export function ModelSwitchPanel(props: {
  currentModel: string
  locale: UiLocale
  onSubmit: (model: string) => void
  onClose: () => void
}) {
  const [value, setValue] = useState('')

  useInput((input, key) => {
    if (isMouseInput(input)) return
    if (key.escape) {
      props.onClose()
      return
    }
    if (key.return) {
      const model = value.trim()
      if (model !== '') props.onSubmit(model)
      return
    }
    if (key.backspace || key.delete) {
      setValue((current) => current.slice(0, -1))
      return
    }
    if (input !== '' && !key.ctrl && !key.meta && !key.super) setValue((current) => current + input)
  })

  return (
    <Box flexDirection="column" borderStyle={PANEL_BORDER} borderColor={theme.border} paddingX={1}>
      <Text color={theme.accent} bold wrap="truncate-end">
        {text(props.locale, 'modelSwitchTitle')}
      </Text>
      <Text color={theme.dim} wrap="truncate-end">
        {text(props.locale, 'modelSwitchCurrent', { model: props.currentModel })}
      </Text>
      <Text color={theme.text} wrap="truncate-end">
        <Text color={theme.accent}>› </Text>
        {value === '' ? (
          <Text color={theme.mute}>{text(props.locale, 'modelSwitchPlaceholder')}</Text>
        ) : (
          value
        )}
      </Text>
      <Text color={theme.dim} wrap="truncate-end">
        {text(props.locale, 'modelSwitchHint')}
      </Text>
    </Box>
  )
}
