import { Box, Text } from 'ink'
import { visibleResumeItems, type ResumePickerState } from '../../runtime/resume-picker.ts'
import { text, type UiLocale } from '../../runtime/ui-locale.ts'
import { theme } from '../theme.ts'

const WINDOW_SIZE = 8

export function ResumePicker(props: {
  state: ResumePickerState
  currentSessionId: string
  locale: UiLocale
}) {
  const items = visibleResumeItems(props.state)
  const start = windowStart(props.state.selected, items.length, WINDOW_SIZE)
  const visible = items.slice(start, start + WINDOW_SIZE)
  const above = start
  const below = Math.max(0, items.length - start - visible.length)

  return (
    <Box
      flexDirection="column"
      marginTop={1}
      borderStyle="round"
      borderColor={theme.brand}
      paddingX={1}
    >
      <Text color={theme.text} bold>
        {text(props.locale, 'resumeTitle')}{' '}
        <Text color={theme.mute}>· {text(props.locale, 'resumeHint')}</Text>
      </Text>
      <Text color={theme.dim}>
        {text(props.locale, 'resumeQuery', { query: props.state.query || '…' })}
      </Text>
      {above > 0 ? <Text color={theme.mute}>↑ {above}</Text> : null}
      {visible.length === 0 ? (
        <Text color={theme.mute}>{text(props.locale, 'resumeEmpty')}</Text>
      ) : (
        visible.map((item, offset) => {
          const index = start + offset
          const active = index === props.state.selected
          const current = item.id === props.currentSessionId
          return (
            <Text key={item.id} color={active ? theme.text : theme.mute} inverse={active}>
              {active ? '›' : ' '} {current ? '✓' : ' '} {item.id.slice(0, 12)}{' '}
              <Text color={active ? theme.text : theme.dim}>
                · {formatTimestamp(item.createdAt, props.locale)}
              </Text>
            </Text>
          )
        })
      )}
      {below > 0 ? <Text color={theme.mute}>↓ {below}</Text> : null}
    </Box>
  )
}

export function windowStart(selected: number, count: number, size: number): number {
  if (count <= size) return 0
  return Math.max(0, Math.min(selected - Math.floor(size / 2), count - size))
}

function formatTimestamp(value: number | undefined, locale: UiLocale): string {
  if (value === undefined) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) return String(value)
  return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}
