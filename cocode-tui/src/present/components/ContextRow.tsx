import { Box, Text } from 'ink'
import type { ContextNode } from '../../runtime/nodes/types.ts'
import type { UiLocale } from '../../runtime/ui-locale.ts'
import { theme } from '../theme.ts'

/** Dedicated diagnostic presentation for model-facing runtime context. */
export function ContextRow(props: {
  node: ContextNode
  expanded: boolean
  locale: UiLocale
}) {
  const { node, expanded, locale } = props
  const role = locale === 'zh'
    ? node.provenance.role === 'recall' ? '上下文召回' : '上下文注入'
    : node.provenance.role === 'recall' ? 'context recall' : 'context injection'
  const details = node.provenance.label === undefined ? [] : [node.provenance.label]

  return (
    <Box flexDirection="column" marginTop={1} paddingLeft={1}>
      <Text color={theme.accent}>
        ◇ {role}
        {details.map((detail, index) => (
          <Text key={`${detail}:${index}`} color={theme.mute}> · {detail}</Text>
        ))}
      </Text>
      {expanded ? <ContextBody node={node} /> : null}
    </Box>
  )
}

function ContextBody({ node }: { node: ContextNode }) {
  if (node.sections.length === 0) {
    return <Text color={theme.dim}>{node.text}</Text>
  }
  return (
    <Box flexDirection="column" paddingLeft={1}>
      {node.sections.map((section, index) => (
        <Box key={`${section.name}:${index}`} flexDirection="column" marginTop={index === 0 ? 0 : 1}>
          <Text color={theme.mute}>{section.name}</Text>
          <Text color={theme.dim}>{section.text}</Text>
        </Box>
      ))}
    </Box>
  )
}
