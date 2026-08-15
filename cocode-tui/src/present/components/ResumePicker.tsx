import { Box, Text } from 'ink'
import {
  RESUME_WINDOW_SIZE,
  visibleResumeItems,
  type ResumePickerState,
} from '../../runtime/resume-picker.ts'
import { text, type UiLocale } from '../../runtime/ui-locale.ts'
import { listWindowStart } from '../list-window.ts'
import { resumeItemPreview } from '../resume-preview.ts'
import { theme } from '../theme.ts'

export function ResumePicker(props: {
  state: ResumePickerState
  currentSessionId: string
  locale: UiLocale
  maxRows?: number
}) {
  const items = visibleResumeItems(props.state)
  const windowSize =
    props.maxRows === undefined
      ? RESUME_WINDOW_SIZE
      : Math.max(1, Math.min(RESUME_WINDOW_SIZE, Math.trunc(props.maxRows) - 7))
  const start = listWindowStart(props.state.selected, items.length, windowSize)
  const visible = items.slice(start, start + windowSize)
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
      <Text color={theme.text} bold wrap="truncate-end">
        {text(props.locale, 'resumeTitle')}{' '}
        <Text color={theme.mute}>· {text(props.locale, 'resumeHint')}</Text>
      </Text>
      <Text color={theme.dim} wrap="truncate-end">
        {text(props.locale, 'resumeQuery', { query: props.state.query || '…' })}
      </Text>
      {above > 0 ? (
        <Text color={theme.mute} wrap="truncate-end">
          ↑ {above}
        </Text>
      ) : null}
      {visible.length === 0 ? (
        <Text color={theme.mute} wrap="truncate-end">
          {text(props.locale, 'resumeEmpty')}
        </Text>
      ) : (
        visible.map((item, offset) => {
          const index = start + offset
          const active = index === props.state.selected
          const current = item.id === props.currentSessionId
          return (
            <Text
              key={item.id}
              color={active ? theme.text : theme.mute}
              inverse={active}
              wrap="truncate-end"
            >
              {active ? '›' : ' '} {current ? '✓' : ' '} {item.id.slice(0, 12)}{' '}
              <Text color={active ? theme.text : theme.dim}>
                · {formatTimestamp(item.createdAt, props.locale)} ·{' '}
                {resumeItemPreview(item, props.locale)}
              </Text>
            </Text>
          )
        })
      )}
      {below > 0 ? (
        <Text color={theme.mute} wrap="truncate-end">
          ↓ {below}
        </Text>
      ) : null}
    </Box>
  )
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
