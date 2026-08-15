import { Box, Text } from 'ink'
import {
  SESSION_TREE_WINDOW_SIZE,
  visibleSessionTreeItems,
  type SessionTreePickerState,
} from '../../runtime/session-tree-picker.ts'
import { text, type UiLocale } from '../../runtime/ui-locale.ts'
import { listWindowStart } from '../list-window.ts'
import { theme } from '../theme.ts'

export function SessionTreePicker(props: {
  state: SessionTreePickerState
  currentSessionId: string
  locale: UiLocale
  maxRows?: number
}) {
  const items = visibleSessionTreeItems(props.state)
  const windowSize =
    props.maxRows === undefined
      ? SESSION_TREE_WINDOW_SIZE
      : Math.max(1, Math.min(SESSION_TREE_WINDOW_SIZE, Math.trunc(props.maxRows) - 7))
  const start = listWindowStart(props.state.selected, items.length, windowSize)
  const visible = items.slice(start, start + windowSize)

  return (
    <Box
      flexDirection="column"
      marginTop={1}
      borderStyle="round"
      borderColor={theme.brand}
      paddingX={1}
    >
      <Text color={theme.text} bold wrap="truncate-end">
        {text(props.locale, 'sessionTreeTitle')}{' '}
        <Text color={theme.mute}>· {text(props.locale, 'sessionTreeHint')}</Text>
      </Text>
      <Text color={theme.dim} wrap="truncate-end">
        {text(props.locale, 'sessionTreeQuery', { query: props.state.query || '…' })}
      </Text>
      {start > 0 ? <Text color={theme.mute}>↑ {start}</Text> : null}
      {visible.length === 0 ? (
        <Text color={theme.mute}>{text(props.locale, 'sessionTreeEmpty')}</Text>
      ) : (
        visible.map((item, offset) => {
          const index = start + offset
          const active = index === props.state.selected
          const current = item.session.id === props.currentSessionId
          const marker = item.orphaned ? '!' : item.current || current ? '✓' : ' '
          const indent = '  '.repeat(Math.min(item.depth, 8))
          const title =
            item.session.title ?? item.session.preview ?? text(props.locale, 'resumeNoSummary')
          return (
            <Text
              key={`${item.session.id}:${item.depth}`}
              color={active ? theme.text : theme.mute}
              inverse={active}
              wrap="truncate-end"
            >
              {active ? '›' : ' '} {marker} {indent}
              {title} · {item.session.id.slice(0, 8)}{' '}
              <Text color={active ? theme.text : theme.dim}>
                {formatTimestamp(item.session.createdAt, props.locale)}
              </Text>
            </Text>
          )
        })
      )}
      {items.length - start - visible.length > 0 ? (
        <Text color={theme.mute}>↓ {items.length - start - visible.length}</Text>
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
