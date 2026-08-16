import { Box, Text } from 'ink'
import { emptyStateLayout } from '../empty-state-layout.ts'
import { WhaleLogo } from './WhaleLogo.tsx'
import { theme } from '../theme.ts'
import { text, type UiLocale } from '../../runtime/ui-locale.ts'

export function EmptyState(props: { maxRows?: number; maxColumns?: number; locale: UiLocale }) {
  const layout = emptyStateLayout(props.maxRows, props.maxColumns)
  return (
    <Box
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      flexGrow={1}
      width="100%"
      height={props.maxRows}
    >
      <WhaleLogo size={layout.logoSize} />
      {layout.showTitle ? (
        <Text color={theme.accent} bold>
          {text(props.locale, 'emptyTitle')}
        </Text>
      ) : null}
      {layout.showHint ? <Text color={theme.mute}>{text(props.locale, 'emptyHint')}</Text> : null}
    </Box>
  )
}
