import { Box, Text } from 'ink'
import { useEffect, useState } from 'react'
import {
  animationForWhaleSize,
  type CharacterAnimation,
  type WhaleLogoSize,
} from '../whale-animation.ts'
import { theme } from '../theme.ts'

export function WhaleLogo(props: { size?: WhaleLogoSize; compact?: boolean; animate?: boolean }) {
  const size = props.size ?? (props.compact === true ? 'inline' : 'large')
  const animation = animationForWhaleSize(size)
  const animate = props.animate !== false && process.env.TERM_PROGRAM !== 'Apple_Terminal'
  const frame = useCharacterFrame(animation, animate)

  if (size === 'inline') return <InlineFrame frame={frame} />
  const lines = frame.split('\n')

  return (
    <Box flexDirection="column" flexShrink={0} height={lines.length}>
      {lines.map((line, index) => (
        <WhaleFrameLine
          key={`${index}:${line}`}
          line={line}
          accent={index < animation.accentRows}
        />
      ))}
    </Box>
  )
}

function InlineFrame(props: { frame: string }) {
  const whaleIndex = props.frame.indexOf('🐋')
  if (whaleIndex < 0) return <Text color={theme.accent}>{props.frame}</Text>

  return (
    <Text>
      <Text color={theme.accent}>{props.frame.slice(0, whaleIndex)}</Text>
      <Text color={theme.accent}>🐋</Text>
      <Text color={theme.accent}>{props.frame.slice(whaleIndex + 2)}</Text>
    </Text>
  )
}

function WhaleFrameLine(props: { line: string; accent: boolean }) {
  if (props.accent) return <Text color={theme.accent}>{props.line}</Text>
  const segments = props.line.match(/cocode|●|█+|0+|1+|[^01●█]+/g) ?? [props.line]
  return (
    <Text>
      {segments.map((segment, index) => (
        <Text key={`${index}:${segment}`} color={segmentColor(segment)} bold={segment === 'cocode'}>
          {segment}
        </Text>
      ))}
    </Text>
  )
}

function segmentColor(segment: string): string {
  if (segment === 'cocode' || segment === '●' || segment.startsWith('█')) return theme.accent
  if (segment.startsWith('0')) return theme.accent
  return theme.accent
}

function useCharacterFrame(animation: CharacterAnimation, animate: boolean): string {
  const [frame, setFrame] = useState(0)

  useEffect(() => {
    setFrame(0)
    if (!animate) return
    const timer = setInterval(() => {
      setFrame((current) => (current + 1) % animation.frames.length)
    }, animation.interval)
    return () => clearInterval(timer)
  }, [animate, animation])

  return animation.frames[frame] ?? animation.frames[0] ?? ''
}
