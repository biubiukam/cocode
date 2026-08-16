import { Box, Text } from 'ink'
import {
  SKILLS_WINDOW_SIZE,
  visibleSkills,
  type SkillsPickerState,
} from '../../runtime/skills-picker.ts'
import { text, type UiLocale } from '../../runtime/ui-locale.ts'
import { listWindowStart } from '../list-window.ts'
import { glyphs } from '../glyphs.ts'
import { selectionStyle } from '../selection.ts'
import { PANEL_BORDER } from '../layout.ts'
import { theme } from '../theme.ts'

export function SkillsPicker(props: {
  state: SkillsPickerState
  locale: UiLocale
  maxRows?: number
}) {
  const items = visibleSkills(props.state)
  const windowSize =
    props.maxRows === undefined
      ? SKILLS_WINDOW_SIZE
      : Math.max(1, Math.min(SKILLS_WINDOW_SIZE, Math.trunc(props.maxRows) - 7))
  const start = listWindowStart(props.state.selected, items.length, windowSize)
  const visible = items.slice(start, start + windowSize)
  const above = start
  const below = Math.max(0, items.length - start - visible.length)

  return (
    <Box
      flexDirection="column"
      marginTop={1}
      borderStyle={PANEL_BORDER}
      borderColor={theme.border}
      paddingX={1}
    >
      <Text color={theme.text} bold wrap="truncate-end">
        {text(props.locale, 'skillsTitle')}{' '}
        <Text color={theme.mute}>· {text(props.locale, 'skillsHint')}</Text>
      </Text>
      <Text color={theme.dim} wrap="truncate-end">
        {text(props.locale, 'skillsQuery', { query: props.state.query || '…' })}
      </Text>
      {above > 0 ? (
        <Text color={theme.mute} wrap="truncate-end">
          ↑ {above}
        </Text>
      ) : null}
      {visible.length === 0 ? (
        <Text color={theme.mute} wrap="truncate-end">
          {text(props.locale, 'skillsEmpty')}
        </Text>
      ) : (
        visible.map((skill, offset) => {
          const index = start + offset
          const active = index === props.state.selected
          return (
            <Text
              key={skill.name}
              {...selectionStyle(active)}
              wrap="truncate-end"
            >
              {active ? glyphs.optionActive : glyphs.optionInactive} /{skill.name}{' '}
              <Text color={active ? theme.text : theme.dim}>· {skill.description}</Text>
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
